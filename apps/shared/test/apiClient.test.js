import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError } from "../apiClient.js";

// A fake fetch that records each request and answers from a list of replies.
function fakeFetch(...replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init, auth: init.headers.Authorization });
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next instanceof Error) throw next;
    const [status, body] = next;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
  };
  return { fetch, calls };
}

const BASE = "http://localhost:8000/v1/";

test("uses the base URL from config and adds query parameters", async () => {
  const { fetch, calls } = fakeFetch([200, { data: [] }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  await api.get("/species", { query: { q: "nepen", page: 2, family: undefined, empty: "" } });
  assert.equal(calls[0].url, "http://localhost:8000/v1/species?q=nepen&page=2");
  assert.equal(calls[0].method, "GET");
});

test("a missing base URL fails clearly on the first request, not at import", async () => {
  const api = createApiClient({ baseUrl: undefined });
  await assert.rejects(api.get("/public/species"), /API base URL is missing/);
});

test("every request carries the current access token", async () => {
  const { fetch, calls } = fakeFetch([200, {}]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  let token = "token-1";
  api.setAuth({ getAccessToken: async () => token });
  await api.get("/me");
  token = "token-2";
  await api.post("/species", { scientific_name: "Nepenthes rajah" });
  assert.deepEqual(calls.map((c) => c.auth), ["Bearer token-1", "Bearer token-2"]);
  assert.equal(calls[1].headers["Content-Type"], "application/json");
  assert.equal(calls[1].body, JSON.stringify({ scientific_name: "Nepenthes rajah" }));
});

test("public routes work without a token (visitor, or before sign-in)", async () => {
  const { fetch, calls } = fakeFetch([200, { data: [] }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  await api.get("/public/species");
  assert.equal(calls[0].auth, undefined);
});

test("expired token: refresh once and retry, without the caller noticing", async () => {
  const { fetch, calls } = fakeFetch([401, { code: "TOKEN_EXPIRED", message: "expired" }], [200, { id: "me" }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  let refreshes = 0;
  api.setAuth({ getAccessToken: async () => "old", refreshSession: async () => { refreshes++; return "new"; } });
  assert.deepEqual(await api.get("/me"), { id: "me" });
  assert.equal(refreshes, 1);
  assert.deepEqual(calls.map((c) => c.auth), ["Bearer old", "Bearer new"]);
});

test("retries only once: a second TOKEN_EXPIRED becomes an error", async () => {
  const { fetch, calls } = fakeFetch([401, { code: "TOKEN_EXPIRED", message: "expired" }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  api.setAuth({ getAccessToken: async () => "old", refreshSession: async () => "new" });
  await assert.rejects(api.get("/me"), (err) => err instanceof ApiError && err.code === "TOKEN_EXPIRED");
  assert.equal(calls.length, 2);
});

test("several requests that expire together share one refresh", async () => {
  const { fetch } = fakeFetch(
    [401, { code: "TOKEN_EXPIRED" }], [401, { code: "TOKEN_EXPIRED" }], [401, { code: "TOKEN_EXPIRED" }],
    [200, {}],
  );
  const api = createApiClient({ baseUrl: BASE, fetch });
  let refreshes = 0;
  api.setAuth({
    getAccessToken: async () => "old",
    refreshSession: () => new Promise((resolve) => setTimeout(() => { refreshes++; resolve("new"); }, 10)),
  });
  await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
  assert.equal(refreshes, 1);
});

test("other 401s (bad or missing token) are not retried", async () => {
  const { fetch, calls } = fakeFetch([401, { code: "INVALID_TOKEN", message: "Access token is not valid" }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  let refreshes = 0;
  api.setAuth({ getAccessToken: async () => "bad", refreshSession: async () => { refreshes++; return "x"; } });
  await assert.rejects(api.get("/me"), (err) => err.userMessage === "Please sign in again.");
  assert.equal(refreshes, 0);
  assert.equal(calls.length, 1);
});

test("API errors become one consistent ApiError with a user message", async () => {
  const cases = [
    [[403, { code: "ACCOUNT_NOT_ACTIVE", message: "x" }], "Your account is waiting for an Admin to approve it."],
    [[403, { code: "FORBIDDEN", message: "x" }], "Your role is not allowed to do this."],
    [[409, { code: "DUPLICATE_SPECIES", message: "A species with this scientific name already exists" }],
      "A species with this scientific name already exists"],
    [[422, { code: "VALIDATION_ERROR", message: "Request body failed validation",
      details: { fields: [{ path: "scientific_name", message: "Required" }] } }], "scientific_name: Required"],
    [[500, { code: "DB_ERROR", message: "relation does not exist" }], "Something went wrong on the server. Please try again."],
    [[502, undefined], "Something went wrong on the server. Please try again."],
  ];
  for (const [reply, expected] of cases) {
    const api = createApiClient({ baseUrl: BASE, fetch: fakeFetch(reply).fetch });
    await assert.rejects(api.get("/x"), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, reply[0]);
      assert.equal(err.userMessage, expected);
      return true;
    });
  }
});

test("server unreachable becomes NETWORK_ERROR", async () => {
  const api = createApiClient({ baseUrl: BASE, fetch: fakeFetch(new TypeError("fetch failed")).fetch });
  await assert.rejects(api.get("/x"), (err) => err.code === "NETWORK_ERROR" && err.status === 0);
});

test("204 No Content returns null; FormData is sent as-is for uploads", async () => {
  const { fetch, calls } = fakeFetch([204], [201, { id: "m1" }]);
  const api = createApiClient({ baseUrl: BASE, fetch });
  assert.equal(await api.delete("/species/1"), null);
  const form = new FormData();
  form.append("caption", "Leaf");
  assert.deepEqual(await api.post("/species/1/media", form), { id: "m1" });
  assert.equal(calls[1].body, form);
  assert.equal(calls[1].headers["Content-Type"], undefined, "browser sets the multipart boundary");
});
