import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Approving a record of a species that has no photos yet makes the record's
// first photo the species' cover (observations.js, coverFromFirstPhoto). A fake
// Supabase answers the REST and Storage calls, so this runs without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const officer = crypto.randomUUID();
const app = createApp({ verify: async () => ({ sub: officer, user_role: 'officer' }) });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

let obsId, speciesId, speciesMedia, uploads;

beforeEach((t) => {
  obsId = crypto.randomUUID();
  speciesId = crypto.randomUUID();
  const specimenId = crypto.randomUUID();
  speciesMedia = [];
  uploads = [];
  const tables = {
    observations: [{ id: obsId, specimen_id: specimenId }],
    specimens: [{ id: specimenId, species_id: speciesId }],
    observation_photos: [{ id: crypto.randomUUID(), observation_id: obsId, s3_bucket: 'observation-photos', s3_key: `${obsId}/a.jpg`, caption: null }],
  };
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    if (url.pathname === '/rest/v1/rpc/review_observation') return json(200, { id: crypto.randomUUID(), decision: 'approve' });
    if (url.pathname.startsWith('/storage/v1/object/observation-photos/')) return new Response(JPEG, { status: 200 });
    if (url.pathname.startsWith('/storage/v1/object/species-media/')) {
      uploads.push(url.pathname);
      return json(200, { Key: url.pathname });
    }
    if (url.pathname === '/rest/v1/species_media') {
      if (method === 'POST') {
        speciesMedia.push(JSON.parse(init.body));
        return json(201, []);
      }
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${speciesMedia.length}` } });
    }
    const table = tables[url.pathname.replace('/rest/v1/', '')] ?? [];
    const filters = [...url.searchParams].filter(([, v]) => v.startsWith('eq.'));
    const rows = table.filter((r) => filters.every(([k, v]) => `${r[k]}` === v.slice(3)));
    const one = new Headers(init.headers).get('Accept') === 'application/vnd.pgrst.object+json';
    return json(200, one ? rows[0] ?? null : rows);
  });
});

const approve = () => request(app).post(`/v1/observations/${obsId}/reviews`)
  .set({ Authorization: 'Bearer officer' }).send({ decision: 'approve', observation_version: 1 });

test('approving a record of a species with no photos makes its first photo the cover', async () => {
  const res = await approve();
  assert.equal(res.status, 201);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], new RegExp(`^/storage/v1/object/species-media/${speciesId}/[0-9a-f-]{36}\\.jpg$`));
  assert.equal(speciesMedia.length, 1);
  assert.equal(speciesMedia[0].species_id, speciesId);
  assert.equal(speciesMedia[0].s3_bucket, 'species-media');
  assert.equal(speciesMedia[0].is_primary, true);
  assert.equal(speciesMedia[0].caption, 'Field observation photo');
  assert.equal(speciesMedia[0].uploaded_by, officer);
});

test('a species that already has photos keeps them', async () => {
  speciesMedia.push({ id: crypto.randomUUID(), species_id: speciesId });
  const res = await approve();
  assert.equal(res.status, 201);
  assert.equal(uploads.length, 0);
  assert.equal(speciesMedia.length, 1);
});
