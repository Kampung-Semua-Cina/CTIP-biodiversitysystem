import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// A fake Supabase: the real handlers run, but fetch answers from the rows below,
// so tests run without the internet. RLS is not simulated: the handler's own
// filters must hide unpublished and deleted species.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const PUBLISHED = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';

const rows = {
  [PUBLISHED]: {
    id: PUBLISHED, scientific_name: 'Nepenthes rajah', common_name: 'Giant pitcher plant',
    family: 'Nepenthaceae', genus: 'Nepenthes', description: 'Largest pitcher plant.',
    conservation_status: 'Endangered', cultural_significance: null,
    is_published: true, is_deleted: false,
    species_media: [
      { id: 'm1', species_id: PUBLISHED, s3_bucket: 'species-media', s3_key: `${PUBLISHED}/m1.jpg`,
        caption: 'Leaf', credit: null, is_primary: false, sort_order: 0, created_at: '2026-10-01T00:00:00Z' },
      { id: 'm2', species_id: PUBLISHED, s3_bucket: 'species-media', s3_key: `${PUBLISHED}/m2.jpg`,
        caption: 'Pitcher', credit: 'SFC', is_primary: true, sort_order: 1, created_at: '2026-10-01T00:00:00Z' },
    ],
  },
  [DRAFT]: { id: DRAFT, scientific_name: 'Rafflesia keithii', is_published: false, is_deleted: false, species_media: [] },
};

let lastUrl;
beforeEach((t) => {
  lastUrl = undefined;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    lastUrl = url;
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const row = rows[id];
    const visible = row && `${row.is_published}` === url.searchParams.get('is_published')?.replace('eq.', '')
      && `${row.is_deleted}` === url.searchParams.get('is_deleted')?.replace('eq.', '');
    // PostgREST only returns selected columns, and the filter columns are not selected.
    const { is_published, is_deleted, ...selected } = row ?? {};
    const body = visible ? [selected] : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

const app = createApp({ verify: async () => { throw new Error('no token needed'); } });

test('GET /public/species/:id returns a published species without a token', async () => {
  const res = await request(app).get(`/v1/public/species/${PUBLISHED}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.scientific_name, 'Nepenthes rajah');
  assert.equal(res.body.media.length, 2);
  assert.equal(
    res.body.primary_image_url,
    `https://test-project.supabase.co/storage/v1/object/public/species-media/${PUBLISHED}/m2.jpg`,
  );
});

test('only published fields are returned, never internal fields or coordinates', async () => {
  const res = await request(app).get(`/v1/public/species/${PUBLISHED}`);
  const allowed = ['id', 'scientific_name', 'common_name', 'family', 'genus', 'description',
    'conservation_status', 'cultural_significance', 'primary_image_url', 'media'];
  assert.deepEqual(Object.keys(res.body).sort(), allowed.sort());
  for (const m of res.body.media) {
    assert.ok(!('s3_key' in m) && !('s3_bucket' in m), 'storage keys stay internal');
  }
  const select = lastUrl.searchParams.get('select');
  for (const banned of ['lat', 'lng', 'specimens', 'created_by', 'is_published']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(select), `query must not select ${banned}`);
  }
});

test('an unpublished species is 404, not shown to visitors', async () => {
  const res = await request(app).get(`/v1/public/species/${DRAFT}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});

test('an unknown id is 404', async () => {
  const res = await request(app).get(`/v1/public/species/${crypto.randomUUID()}`);
  assert.equal(res.status, 404);
});

test('a malformed id is 404 without querying the database', async () => {
  const res = await request(app).get('/v1/public/species/not-a-uuid');
  assert.equal(res.status, 404);
  assert.equal(lastUrl, undefined);
});