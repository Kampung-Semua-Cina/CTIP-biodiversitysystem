import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetAttemptLimits, ATTEMPT_LIMIT } from '../src/session.js';

// Sign-in, refresh and passwords through the API (CTIP-114). A fake Supabase
// Auth answers the calls the API makes, so these run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const officerId = crypto.randomUUID();
const verify = async (token) => ({ sub: officerId, user_role: 'officer', email: 'officer@example.com', token });
const app = createApp({ verify });

let calls; // what the API sent to Supabase Auth
let password; // the officer's current password

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (n) => ({
  access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: officerId, email: 'officer@example.com' },
});
let issued = 0;

async function fakeAuth(input, init = {}) {
  const url = new URL(input);
  const body = init.body ? JSON.parse(init.body) : {};
  const auth = new Headers(init.headers).get('Authorization');
  calls.push({ method: init.method ?? 'GET', path: url.pathname + url.search, body, auth });
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    if (body.email === 'officer@example.com' && body.password === password) return json(200, session(++issued));
    return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    if (body.refresh_token === 'refresh-ok') return json(200, session(++issued));
    return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
  }
  if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
  if (url.pathname === '/auth/v1/recover') return json(200, {});
  if (url.pathname === '/auth/v1/user' && init.method === 'PUT') {
    if (body.password === 'weakweak') return json(422, { code: 422, error_code: 'weak_password', msg: 'Password is too weak' });
    password = body.password;
    return json(200, { id: officerId });
  }
  return json(404, { msg: `no fake for ${url.pathname}` });
}

beforeEach((t) => {
  calls = [];
  password = 'old-password';
  resetAttemptLimits();
  t.mock.method(globalThis, 'fetch', fakeAuth);
});

test('sign-in returns the session the app stores', async () => {
  const res = await request(app).post('/v1/auth/sign-in').send({ email: 'Officer@Example.com ', password: 'old-password' });
  assert.equal(res.status, 200);
  assert.match(res.body.access_token, /^access-/);
  assert.match(res.body.refresh_token, /^refresh-/);
  assert.equal(typeof res.body.expires_at, 'number');
  assert.deepEqual(res.body.user, { id: officerId, email: 'officer@example.com' });
  assert.equal(calls[0].body.email, 'officer@example.com', 'email is trimmed and lower-cased');
});

test('wrong password: 401 INVALID_CREDENTIALS; a bad body: 422', async () => {
  const wrong = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');
  const bad = await request(app).post('/v1/auth/sign-in').send({ email: 'not-an-email', password: 'x' });
  assert.equal(bad.status, 422);
});

test(`more than ${ATTEMPT_LIMIT} sign-in attempts from one address in 5 minutes: 429`, async () => {
  for (let i = 0; i < ATTEMPT_LIMIT; i++) {
    assert.equal((await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' })).status, 401);
  }
  const blocked = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY_ATTEMPTS');
  assert.equal(calls.length, ATTEMPT_LIMIT, 'the blocked attempt never reaches Supabase');
});

test('refresh swaps a refresh token for a new session; an unknown one ends it', async () => {
  const ok = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'refresh-ok' });
  assert.equal(ok.status, 200);
  assert.match(ok.body.access_token, /^access-/);
  const ended = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'stolen' });
  assert.equal(ended.status, 401);
  assert.equal(ended.body.code, 'SESSION_ENDED');
});

test('sign-out ends that session in Supabase, and works without a token too', async () => {
  const res = await request(app).post('/v1/auth/sign-out').set('Authorization', 'Bearer access-9');
  assert.equal(res.status, 204);
  assert.deepEqual(calls.map((c) => [c.path, c.auth]), [['/auth/v1/logout?scope=local', 'Bearer access-9']]);
  calls = [];
  assert.equal((await request(app).post('/v1/auth/sign-out')).status, 204);
  assert.equal(calls.length, 0);
});

test('password reset: 202 for any address, so it never reveals who has an account', async () => {
  const res = await request(app).post('/v1/auth/password-reset').send({ email: 'nobody@example.com' });
  assert.equal(res.status, 202);
  assert.equal(calls[0].path.startsWith('/auth/v1/recover'), true);
});

test('change password: needs a token; a wrong current password changes nothing', async () => {
  assert.equal((await request(app).post('/v1/me/password').send({ new_password: 'new-password' })).status, 401);
  const wrong = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1')
    .send({ current_password: 'guess', new_password: 'new-password' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.code, 'WRONG_PASSWORD');
  assert.equal(password, 'old-password');
  assert.equal(calls.some((c) => c.path === '/auth/v1/user'), false);
});

test('change password with the right current one: 204, set as the signed-in user, check session closed', async () => {
  const res = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1')
    .send({ current_password: 'old-password', new_password: 'new-password' });
  assert.equal(res.status, 204);
  assert.equal(password, 'new-password');
  const put = calls.find((c) => c.path === '/auth/v1/user');
  assert.equal(put.auth, 'Bearer access-1', "changed with the caller's own token");
  assert.equal(calls.some((c) => c.path.startsWith('/auth/v1/logout')), true, 'the session opened to check the password is closed');
});

test('after a reset link (no current password) the new one is set; a weak one is refused', async () => {
  const ok = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'new-password' });
  assert.equal(ok.status, 204);
  const weak = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'weakweak' });
  assert.equal(weak.status, 422);
  assert.equal(weak.body.code, 'WEAK_PASSWORD');
  const short = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'short' });
  assert.equal(short.status, 422);
});
