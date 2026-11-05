import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetAttemptLimits, ATTEMPT_LIMIT } from '../src/session.js';

// Two-step sign-in (VA-70). A fake Supabase Auth answers the calls the API
// makes, so these run without the internet. Tokens here are just names:
// verify() below says who each one belongs to.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const ids = { officer: crypto.randomUUID(), botanist: crypto.randomUUID() };
const people = {
  'officer-aal1': { sub: ids.officer, user_role: 'officer', aal: 'aal1' },
  'officer-aal2': { sub: ids.officer, user_role: 'officer', aal: 'aal2' },
  'admin-aal1': { sub: crypto.randomUUID(), user_role: 'admin', aal: 'aal1' },
  'botanist-aal1': { sub: ids.botanist, user_role: 'botanist', aal: 'aal1' },
};
const verify = async (token) => {
  if (!people[token]) throw new Error('bad token');
  return people[token];
};
const handlers = { 'get /me': (req, res) => res.json({ id: req.user.id, role: req.user.role }) };
const app = createApp({ verify, mfaRoles: ['officer', 'admin'] });
const appNoMfa = createApp({ verify, handlers });
const appWithMe = createApp({ verify, handlers, mfaRoles: ['officer', 'admin'] });

// A JWT-shaped token with the given claims (the API only reads user_role from it).
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');

let calls;
let factors; // the officer's factors in the fake Supabase
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ method, path: url.pathname, body });
  const p = url.pathname.replace('/auth/v1', '');
  if (p === '/token') {
    const role = body.email.split('@')[0];
    return json(200, {
      access_token: jwt({ user_role: role, aal: 'aal1' }), refresh_token: 'r1', expires_in: 900,
      expires_at: Math.floor(Date.now() / 1000) + 900,
      user: { id: ids.officer, email: body.email, factors: role === 'officer' ? factors : [] },
    });
  }
  if (p === '/user' && method === 'GET') return json(200, { id: ids.officer, factors });
  if (p === '/factors' && method === 'POST') {
    const f = { id: crypto.randomUUID(), factor_type: 'totp', status: 'unverified' };
    factors.push(f);
    return json(200, { id: f.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCDEF', uri: 'otpauth://totp/x' } });
  }
  const del = /^\/factors\/([^/]+)$/.exec(p);
  if (del && method === 'DELETE') {
    factors = factors.filter((f) => f.id !== del[1]);
    return json(200, {});
  }
  if (/^\/factors\/[^/]+\/challenge$/.test(p)) return json(200, { id: 'challenge-1' });
  if (/^\/factors\/[^/]+\/verify$/.test(p)) {
    if (body.code !== '123456') return json(422, { error_code: 'mfa_verification_failed' });
    return json(200, { access_token: 'officer-aal2', refresh_token: 'r2', expires_in: 900, token_type: 'bearer', user: { id: ids.officer } });
  }
  return json(404, {});
};

beforeEach(() => {
  calls = [];
  factors = [];
  resetAttemptLimits();
});

test('officer and admin with a password-only token: every normal route answers 403 MFA_REQUIRED', async () => {
  for (const token of ['officer-aal1', 'admin-aal1']) {
    const res = await request(appWithMe).get('/v1/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'MFA_REQUIRED');
  }
});

test('officer with an aal2 token and a botanist without one get through', async () => {
  for (const token of ['officer-aal2', 'botanist-aal1']) {
    const res = await request(appWithMe).get('/v1/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200, token);
  }
});

test('with no mfaRoles (older tests, MFA_OFF) nothing changes', async () => {
  const res = await request(appNoMfa).get('/v1/me').set('Authorization', 'Bearer officer-aal1');
  assert.equal(res.status, 200);
});

test('sign-in says what comes next: setup for an officer with no app, verify once set up, none for a botanist', async () => {
  let res = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@x.my', password: 'pw' });
  assert.equal(res.status, 200);
  assert.equal(res.body.mfa, 'setup');
  factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
  res = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@x.my', password: 'pw' });
  assert.equal(res.body.mfa, 'verify');
  res = await request(app).post('/v1/auth/sign-in').send({ email: 'botanist@x.my', password: 'pw' });
  assert.equal(res.body.mfa, 'none');
});

test('enroll works with the password-only token, removes unfinished set-ups, and answers the QR code', async () => {
  factors = [{ id: 'old', factor_type: 'totp', status: 'unverified' }];
  const res = await request(app).post('/v1/auth/mfa/enroll').set('Authorization', 'Bearer officer-aal1');
  assert.equal(res.status, 201);
  assert.ok(res.body.qr_code.startsWith('data:image/svg+xml'));
  assert.equal(res.body.secret, 'ABCDEF');
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/factors/old')));
  assert.equal(factors.length, 1);
});

test('enroll is refused once an app is set up, so a stolen password cannot replace it', async () => {
  factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
  const res = await request(app).post('/v1/auth/mfa/enroll').set('Authorization', 'Bearer officer-aal1');
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'MFA_ALREADY_SET_UP');
});

test('verify: right code gives a new session, wrong code 401, bad format 422', async () => {
  factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
  let res = await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '000000' });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'WRONG_CODE');
  res = await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '12ab' });
  assert.equal(res.status, 422);
  res = await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '123456' });
  assert.equal(res.status, 200);
  assert.equal(res.body.access_token, 'officer-aal2');
  assert.ok(res.body.expires_at > Date.now() / 1000);
});

test('verify with no app set up: 409 MFA_NOT_SET_UP', async () => {
  const res = await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '123456' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'MFA_NOT_SET_UP');
});

test('guessing codes is limited: 429 after the limit', async () => {
  factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
  for (let i = 0; i < ATTEMPT_LIMIT; i++) {
    await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '000000' });
  }
  const res = await request(app).post('/v1/auth/mfa/verify').set('Authorization', 'Bearer officer-aal1').send({ code: '123456' });
  assert.equal(res.status, 429);
});

test('the MFA routes still need a signed-in token', async () => {
  const res = await request(app).post('/v1/auth/mfa/enroll');
  assert.equal(res.status, 401);
});
