import { test } from "node:test";
import assert from "node:assert/strict";
import { userMessage, getApiBaseUrl, setApiBaseUrl } from "../api.js";

// What the user sees for an API error (moved here from apiClient.js, CTIP-49).
test("API errors get one consistent user message", () => {
  const cases = [
    [{ status: 403, code: "ACCOUNT_NOT_ACTIVE", message: "x" }, "Your account is waiting for an Admin to approve it."],
    [{ status: 403, code: "FORBIDDEN", message: "x" }, "Your role is not allowed to do this."],
    [{ status: 401, code: "INVALID_TOKEN", message: "x" }, "Please sign in again."],
    [{ status: 409, code: "DUPLICATE_SPECIES", message: "A species with this scientific name already exists" },
      "A species with this scientific name already exists"],
    [{ status: 422, code: "VALIDATION_ERROR", message: "Request body failed validation",
      details: { fields: [{ path: "scientific_name", message: "Required" }] } }, "scientific_name: Required"],
    [{ status: 500, code: "DB_ERROR", message: "relation does not exist" }, "Something went wrong on the server. Please try again."],
    [{ status: 502, code: "HTTP_502", message: "Bad Gateway" }, "Something went wrong on the server. Please try again."],
    [{ status: 0, code: "NETWORK_ERROR", message: "fetch failed" }, "Can't reach the server. Check your connection and try again."],
    [{ status: 418, code: "HTTP_418" }, "Something went wrong. Please try again."],
  ];
  for (const [res, expected] of cases) assert.equal(userMessage(res), expected);
});

test("the API address: Render by default in Node, /v1 added to a set address", () => {
  assert.equal(getApiBaseUrl(), "https://ctip-biodiversitysystem.onrender.com/v1");
  setApiBaseUrl("http://192.168.1.10:8000/");
  assert.equal(getApiBaseUrl(), "http://192.168.1.10:8000/v1");
  setApiBaseUrl("https://example.test/v1");
  assert.equal(getApiBaseUrl(), "https://example.test/v1");
  setApiBaseUrl(null);
  assert.equal(getApiBaseUrl(), "https://ctip-biodiversitysystem.onrender.com/v1");
});
