import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { checkSecureConfig } from '../src/https.js';

// CTIP-35: in production the API only answers over HTTPS. Tests use a fake
// hosting proxy: X-Forwarded-Proto says whether the client used https.
const app = createApp({ verify: async () => ({}), handlers: {}, requireHttps: true, trustProxy: 1 });

test('plain HTTP is rejected with 403 HTTPS_REQUIRED, public and protected routes alike', async () => {
  for (const path of ['/v1/public/species', '/v1/me']) {
    const res = await request(app).get(path).set('X-Forwarded-Proto', 'http');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'HTTPS_REQUIRED');
  }
});

test('HTTPS requests go through and carry an HSTS header', async () => {
  const res = await request(app).get('/v1/public/species').set('X-Forwarded-Proto', 'https');
  assert.equal(res.status, 501); // reached the route (handlers: {} answers 501)
  assert.match(res.headers['strict-transport-security'], /max-age=31536000/);
});

test('a client cannot fake HTTPS when the API is not told to trust a proxy', async () => {
  const direct = createApp({ verify: async () => ({}), handlers: {}, requireHttps: true });
  const res = await request(direct).get('/v1/public/species').set('X-Forwarded-Proto', 'https');
  assert.equal(res.status, 403);
});

test('local development (REQUIRE_HTTPS off) still works over http://localhost', async () => {
  const local = createApp({ verify: async () => ({}), handlers: {} });
  assert.equal((await request(local).get('/v1/public/species')).status, 501);
});

test('production refuses to start with a non-HTTPS Supabase URL or CORS origin', () => {
  const good = { REQUIRE_HTTPS: 'true', SUPABASE_URL: 'https://x.supabase.co', CORS_ORIGINS: 'https://ctip.example' };
  assert.doesNotThrow(() => checkSecureConfig(good));
  assert.throws(() => checkSecureConfig({ ...good, SUPABASE_URL: 'http://x.supabase.co' }), /SUPABASE_URL/);
  assert.throws(() => checkSecureConfig({ ...good, CORS_ORIGINS: 'https://ctip.example,http://localhost:5173' }), /CORS origin/);
  assert.doesNotThrow(() => checkSecureConfig({ SUPABASE_URL: 'http://127.0.0.1:54321' }), 'off locally');
});
