import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// F-12: the API must not say which server software it runs.
test('responses have no X-Powered-By header', async () => {
  const app = createApp({ verify: async () => ({}), handlers: {} });
  const res = await request(app).get('/v1/public/species');
  assert.equal(res.headers['x-powered-by'], undefined);
});