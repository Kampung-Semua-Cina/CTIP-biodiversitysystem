import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getSession, setSession, getAuthToken, freshAuthToken, onSessionEnded,
  signInApi, signOutApi, takeSessionFromUrl, tokenClaims, setStorageAdapter, restoreSession,
} from "../api.js";

// The apps' session (CTIP-114): signed in, renewed and ended through the API,
// never through Supabase. A fake fetch stands in for the API.
const now = () => Math.floor(Date.now() / 1000);
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

let calls;
function answer(...replies) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers?.Authorization });
    await new Promise((r) => setTimeout(r, 5)); // let callers overlap
    const [status, body] = replies.length > 1 ? replies.shift() : replies[0];
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
}

beforeEach(() => setSession(null));

test("sign-in stores the session the API returns and sends no old token", async () => {
  setSession({ access_token: "stale" });
  const session = { access_token: "a1", refresh_token: "r1", expires_at: now() + 3600, user: { id: "u1", email: "x@y.z" } };
  answer([200, session]);
  const res = await signInApi("x@y.z", "pw");
  assert.equal(res.ok, true);
  assert.equal(calls[0].url, "https://ctip-biodiversitysystem.onrender.com/v1/auth/sign-in");
  assert.equal(calls[0].auth, undefined);
  assert.deepEqual(getSession(), session);
});

test("a wrong password stores nothing", async () => {
  answer([401, { code: "INVALID_CREDENTIALS", message: "Wrong email or password" }]);
  const res = await signInApi("x@y.z", "nope");
  assert.equal(res.ok, false);
  assert.equal(res.message, "Wrong email or password");
  assert.equal(getSession(), null);
});

test("a token with time left is used as it is", async () => {
  setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() + 600 });
  answer([500, {}]);
  assert.equal(await freshAuthToken(), "a1");
  assert.equal(calls.length, 0);
});

test("a token about to expire is renewed once, however many calls ask at the same time", async () => {
  setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() + 30 });
  answer([200, { access_token: "a2", refresh_token: "r2", expires_at: now() + 3600, user: { id: "u1" } }]);
  const tokens = await Promise.all([freshAuthToken(), freshAuthToken(), freshAuthToken()]);
  assert.deepEqual(tokens, ["a2", "a2", "a2"]);
  assert.equal(calls.length, 1, "each refresh token works once, so only one refresh");
  assert.deepEqual(calls[0].body, { refresh_token: "r1" });
  assert.equal(getSession().refresh_token, "r2");
});

test("a refused refresh ends the session and tells the app", async () => {
  setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() - 10 });
  answer([401, { code: "SESSION_ENDED" }]);
  let ended = 0;
  const off = onSessionEnded(() => ended++);
  assert.equal(await freshAuthToken(), null);
  off();
  assert.equal(ended, 1);
  assert.equal(getSession(), null);
});

test("API unreachable during a refresh: keep the session and the old token", async () => {
  setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() + 10 });
  calls = [];
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.equal(await freshAuthToken(), "a1");
  assert.equal(getSession().refresh_token, "r1");
});

test("the expiry is read from the token when the session does not say", async () => {
  setSession({ access_token: jwt({ sub: "u1", exp: now() + 20 }), refresh_token: "r1" });
  answer([200, { access_token: "a2", refresh_token: "r2", expires_at: now() + 3600 }]);
  assert.equal(await freshAuthToken(), "a2");
});

test("sign-out forgets the session straight away and tells the API", async () => {
  setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() + 3600 });
  answer([204]);
  await signOutApi();
  assert.equal(getAuthToken(), null);
  assert.equal(calls[0].url, "https://ctip-biodiversitysystem.onrender.com/v1/auth/sign-out");
  assert.equal(calls[0].auth, "Bearer a1");
});

test("a password-reset link's session is read from the address", () => {
  const token = jwt({ sub: "u9", email: "r@x.y", exp: now() + 3600 });
  globalThis.window = { location: { hash: `#access_token=${token}&expires_at=123&refresh_token=r9&token_type=bearer&type=recovery` } };
  try {
    assert.equal(takeSessionFromUrl(), "recovery");
    assert.deepEqual(getSession(), { access_token: token, refresh_token: "r9", expires_at: 123, user: { id: "u9", email: "r@x.y" } });
    window.location.hash = "#error=access_denied&error_code=otp_expired";
    assert.equal(takeSessionFromUrl(), "expired");
    window.location.hash = "#/plants?q=nepenthes";
    assert.equal(takeSessionFromUrl(), null);
  } finally {
    delete globalThis.window;
  }
});

test("tokenClaims reads base64url without padding", () => {
  assert.equal(tokenClaims(jwt({ sub: "ünï", exp: 1 })).exp, 1);
  assert.equal(tokenClaims("not a token"), null);
});

test("custom storage adapter persists and restores session across app restarts", async () => {
  const store = new Map();
  const mockStorage = {
    getItem: async (k) => store.get(k) || null,
    setItem: async (k, v) => store.set(k, String(v)),
    removeItem: async (k) => store.delete(k),
  };

  setStorageAdapter(mockStorage);
  const session = { access_token: "tok1", refresh_token: "ref1", expires_at: now() + 3600, user: { id: "u123", email: "botanist@sfc.my" } };
  setSession(session);

  // Stored in mock storage
  assert.ok(store.has("daun_session"));
  assert.equal(JSON.parse(store.get("daun_session")).access_token, "tok1");

  // Simulate app restart: clear in-memory session
  setSession(null);
  store.set("daun_session", JSON.stringify(session)); // re-populate persistence to simulate app restart with saved data

  // restoreSession should rehydrate the session
  const restored = await restoreSession();
  assert.deepEqual(restored, session);
  assert.equal(getAuthToken(), "tok1");

  // Sign out removes from persistence
  await signOutApi();
  assert.equal(store.has("daun_session"), false);
  setStorageAdapter(null);
});

test("uses a session another tab renewed instead of spending an old refresh token", async () => {
  const saved = new Map();
  globalThis.window = { localStorage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) } };
  try {
    setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() - 10, user: { id: "u1" } });
    // The other tab refreshed first: only its copy in storage has the new session.
    saved.set("daun_session", JSON.stringify({ access_token: "a2", refresh_token: "r2", expires_at: now() + 3600, user: { id: "u1" } }));
    answer([401, { code: "SESSION_ENDED", message: "ended" }]);
    assert.equal(await freshAuthToken(), "a2");
    assert.equal(calls.length, 0);
  } finally {
    delete globalThis.window;
  }
});

test("a refresh that loses the race to another tab keeps the session", async () => {
  const saved = new Map();
  globalThis.window = { localStorage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) } };
  let ended = 0;
  const off = onSessionEnded(() => { ended++; });
  try {
    setSession({ access_token: "a1", refresh_token: "r1", expires_at: now() - 10, user: { id: "u1" } });
    calls = [];
    globalThis.fetch = async () => {
      saved.set("daun_session", JSON.stringify({ access_token: "a2", refresh_token: "r2", expires_at: now() + 3600 }));
      return new Response(JSON.stringify({ code: "SESSION_ENDED", message: "ended" }), { status: 401, headers: { "Content-Type": "application/json" } });
    };
    assert.equal(await freshAuthToken(), "a2");
    assert.equal(ended, 0);
  } finally {
    off();
    delete globalThis.window;
  }
});
