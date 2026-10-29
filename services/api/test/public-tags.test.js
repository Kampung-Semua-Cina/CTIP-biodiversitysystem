import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetRateLimits } from '../src/rateLimit.js';
import { TAG_LOOKUP_LIMIT } from '../src/handlers.js';

// Visitor QR page (CTIP-33): GET /public/tags/:qrId. A fake Supabase answers
// the database function public_plant_by_tag() from `plants` (as if it had
// already applied the "is this plant public" rule) and the species lookup
// from `species`, so tests run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const COMMON = '11111111-1111-4111-8111-111111111111';
const RAJAH = '22222222-2222-4222-8222-222222222222';
const HIDDEN = '33333333-3333-4333-8333-333333333333';

const species = {
  [COMMON]: {
    id: COMMON, scientific_name: 'Shorea macrophylla', common_name: 'Engkabang', family: 'Dipterocarpaceae',
    genus: 'Shorea', description: 'Illipe nut tree.', conservation_status: 'Least concern',
    cultural_significance: 'Nuts pressed for oil.', is_published: true, is_deleted: false,
    species_media: [{ id: 'm1', species_id: COMMON, s3_bucket: 'species-media', s3_key: `${COMMON}/m1.jpg`,
      caption: null, credit: null, is_primary: true, sort_order: 0, created_at: '2026-10-01T00:00:00Z' }],
  },
  [RAJAH]: {
    id: RAJAH, scientific_name: 'Nepenthes rajah', common_name: 'Giant pitcher plant', family: 'Nepenthaceae',
    genus: 'Nepenthes', description: null, conservation_status: 'Endangered', cultural_significance: null,
    is_published: true, is_deleted: false, species_media: [],
  },
  [HIDDEN]: { id: HIDDEN, scientific_name: 'Unpublished', is_published: false, is_deleted: false, species_media: [] },
};

// What public_plant_by_tag() returns for each tag.
const plants = {
  'NIAH-0001': { qr_id: 'NIAH-0001', species_id: COMMON, lat: 3.81234, lng: 113.77561, location_reduced: false },
  'NIAH-0002': { qr_id: 'NIAH-0002', species_id: RAJAH, lat: 3.815, lng: 113.775, location_reduced: true },
  // The function missed that this species is endangered: the API must still reduce it.
  'NIAH-0003': { qr_id: 'NIAH-0003', species_id: RAJAH, lat: 3.81234, lng: 113.77561, location_reduced: false },
  'NIAH-0004': { qr_id: 'NIAH-0004', species_id: COMMON, lat: null, lng: null, location_reduced: false },
  'NIAH-0005': { qr_id: 'NIAH-0005', species_id: HIDDEN, lat: 3.8, lng: 113.77, location_reduced: false },
};

let calls;
beforeEach((t) => {
  calls = [];
  resetRateLimits();
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    calls.push(url);
    let body;
    if (url.pathname.endsWith('/rpc/public_plant_by_tag')) {
      const { p_qr_id } = JSON.parse(init.body);
      body = plants[p_qr_id] ? [plants[p_qr_id]] : [];
    } else {
      const row = species[url.searchParams.get('id')?.replace('eq.', '')];
      const visible = row && `${row.is_published}` === url.searchParams.get('is_published')?.replace('eq.', '')
        && `${row.is_deleted}` === url.searchParams.get('is_deleted')?.replace('eq.', '');
      const { is_published, is_deleted, ...selected } = row ?? {};
      body = visible ? [selected] : [];
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

const app = createApp({ verify: async () => { throw new Error('no token needed'); } });

test('a published plant opens without a token, with its species and only public fields', async () => {
  const res = await request(app).get('/v1/public/tags/NIAH-0001');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['lat', 'lng', 'location_reduced', 'qr_id', 'species']);
  assert.equal(res.body.qr_id, 'NIAH-0001');
  assert.equal(res.body.lat, 3.81234);
  assert.equal(res.body.location_reduced, false);
  assert.equal(res.body.species.common_name, 'Engkabang');
  assert.equal(res.body.species.cultural_significance, 'Nuts pressed for oil.');
  assert.equal(
    res.body.species.primary_image_url,
    `https://test-project.supabase.co/storage/v1/object/public/species-media/${COMMON}/m1.jpg`,
  );
  for (const banned of ['registered_by', 'endangered_override', 'proposed_species_name', 'gps_accuracy_m', 'id']) {
    assert.ok(!(banned in res.body), `${banned} stays internal`);
  }
});

test('an endangered plant never shows its exact spot', async () => {
  const res = await request(app).get('/v1/public/tags/NIAH-0002');
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.lat, res.body.lng, res.body.location_reduced], [3.815, 113.775, true]);
});

test('the API reduces an endangered spot even if the database function did not', async () => {
  const res = await request(app).get('/v1/public/tags/NIAH-0003');
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.lat, res.body.lng, res.body.location_reduced], [3.815, 113.775, true]);
});

test('a plant with no GPS fix keeps no location', async () => {
  const res = await request(app).get('/v1/public/tags/NIAH-0004');
  assert.equal(res.status, 200);
  assert.equal(res.body.lat, null);
  assert.equal(res.body.lng, null);
});

test('unknown, unused or unpublished tags are all the same 404', async () => {
  for (const qr of ['NIAH-9999', 'NIAH-0005']) {
    const res = await request(app).get(`/v1/public/tags/${qr}`);
    assert.equal(res.status, 404, qr);
    assert.equal(res.body.code, 'NOT_FOUND');
  }
});

test('a lower-case tag is looked up in capitals; a malformed one never reaches the database', async () => {
  const ok = await request(app).get('/v1/public/tags/niah-0001');
  assert.equal(ok.status, 200);
  calls = [];
  const bad = await request(app).get(`/v1/public/tags/${encodeURIComponent("x' or 1=1")}`);
  assert.equal(bad.status, 404);
  assert.equal(calls.length, 0);
});

test(`more than ${TAG_LOOKUP_LIMIT} lookups a minute from one address: 429 with Retry-After`, async () => {
  for (let i = 0; i < TAG_LOOKUP_LIMIT; i++) {
    assert.equal((await request(app).get('/v1/public/tags/NIAH-9999')).status, 404);
  }
  calls = [];
  const blocked = await request(app).get('/v1/public/tags/NIAH-0001');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY_ATTEMPTS');
  assert.equal(blocked.headers['retry-after'], '60');
  assert.equal(calls.length, 0, 'the blocked lookup never reaches the database');
});
