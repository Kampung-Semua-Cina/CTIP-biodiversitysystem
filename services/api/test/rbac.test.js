import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createApp } from '../src/app.js';
import { createVerifier } from '../src/auth/verifyToken.js';
import { routes, PUBLIC, SENSOR } from '../src/permissions.js';

// A fake Supabase: our own signing key, so tests run without the internet.
const SUPABASE_URL = 'https://test-project.supabase.co';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256' };
const verify = createVerifier({ supabaseUrl: SUPABASE_URL, keySet: createLocalJWKSet({ keys: [jwk] }) });

// handlers: {} makes every endpoint answer 501, so these tests check access only.
const app = createApp({ verify, handlers: {} });

const now = () => Math.floor(Date.now() / 1000);
function tokenFor(role, { exp = now() + 3600, key = privateKey, issuer = `${SUPABASE_URL}/auth/v1` } = {}) {
  return new SignJWT({ user_role: role, email: `${role}@gmail.com`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject(crypto.randomUUID())
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt(exp - 3600)
    .setExpirationTime(exp)
    .sign(key);
}

const fillPath = (path) =>
  '/v1' + path.replace(':id', crypto.randomUUID()).replace(':photoId', crypto.randomUUID()).replace(':qrId', 'QR-0001');

const ROLES = ['botanist', 'officer', 'admin'];
const protectedRoutes = routes.filter(([, , roles]) => roles !== PUBLIC && roles !== SENSOR);

for (const role of ROLES) {
  test(`${role}: allowed routes pass, forbidden routes get 403`, async () => {
    const token = await tokenFor(role);
    for (const [method, path, roles] of protectedRoutes) {
      const res = await request(app)[method](fillPath(path)).set('Authorization', `Bearer ${token}`);
      const label = `${role} ${method.toUpperCase()} ${path}`;
      if (roles.includes(role)) {
        assert.ok(![401, 403].includes(res.status), `${label} should be allowed, got ${res.status}`);
      } else {
        assert.equal(res.status, 403, `${label} should be forbidden`);
        assert.equal(res.body.code, 'FORBIDDEN');
      }
    }
  });
}

test('visitor (no token): public routes work, every protected route gets 401', async () => {
  for (const [method, path, roles] of routes) {
    if (roles === SENSOR) continue;
    const res = await request(app)[method](fillPath(path));
    if (roles === PUBLIC) assert.equal(res.status, 501, `${path} should not need a token`);
    else assert.equal(res.status, 401, `${method} ${path} should need a token`);
  }
});

test('expired token gets 401 TOKEN_EXPIRED so the app knows to refresh', async () => {
  const token = await tokenFor('admin', { exp: now() - 60 });
  const res = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'TOKEN_EXPIRED');
});

test('token signed by someone else gets 401', async () => {
  const attacker = await generateKeyPair('ES256');
  const token = await tokenFor('admin', { key: attacker.privateKey });
  const res = await request(app).get('/v1/profiles').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'INVALID_TOKEN');
});

test('token from another Supabase project gets 401', async () => {
  const token = await tokenFor('admin', { issuer: 'https://other-project.supabase.co/auth/v1' });
  const res = await request(app).get('/v1/profiles').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
});

test('malformed token gets 401', async () => {
  const res = await request(app).get('/v1/me').set('Authorization', 'Bearer not-a-jwt');
  assert.equal(res.status, 401);
});

test('role in the request body is ignored', async () => {
  const token = await tokenFor('botanist');
  const res = await request(app)
    .post('/v1/species')
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'admin', user_role: 'admin', scientific_name: 'Nepenthes rajah' });
  assert.equal(res.status, 403);
});

test('signed-in account with no active role gets 403 ACCOUNT_NOT_ACTIVE', async () => {
  const token = await tokenFor(null);
  const res = await request(app).get('/v1/me').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ACCOUNT_NOT_ACTIVE');
});