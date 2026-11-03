import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { GRID_DEGREES } from '../src/distribution.js';

// A fake Supabase: fetch answers with the approved observations below (the
// shape PostgREST returns for the embedded select), so tests run without the
// internet. RLS is not simulated; these tests check what each role is sent.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const verify = async (role) => ({ sub: crypto.randomUUID(), user_role: role });
const app = createApp({ verify });
const as = (role) => ({ Authorization: `Bearer ${role}` });

const RAJAH = { id: crypto.randomUUID(), scientific_name: 'Nepenthes rajah', common_name: 'Giant pitcher plant', family: 'Nepenthaceae', conservation_status: 'Endangered' };
const AMPULLARIA = { id: crypto.randomUUID(), scientific_name: 'Nepenthes ampullaria', common_name: null, family: 'Nepenthaceae', conservation_status: 'least concern' };
const SHOREA = { id: crypto.randomUUID(), scientific_name: 'Shorea albida', common_name: 'Alan batu', family: 'Dipterocarpaceae', conservation_status: 'vulnerable' };

const specimen = (qr_id, species, endangered_override = false) =>
  ({ id: crypto.randomUUID(), qr_id, endangered_override, species_id: species.id, species });
const obs = (spec, lat, lng, observed_at) =>
  ({ id: crypto.randomUUID(), observed_at, lat, lng, gps_accuracy_m: 4, specimens: spec });

const rajahPlant = specimen('QR-0001', RAJAH);
const ampullariaPlant = specimen('QR-0002', AMPULLARIA);
const shoreaFlagged = specimen('QR-0003', SHOREA, true); // officer flagged this one plant as endangered
const shoreaPlant = specimen('QR-0004', SHOREA, false); // vulnerable species without officer override

const rows = [
  obs(rajahPlant, 3.815372, 113.781946, '2026-10-20T02:00:00Z'),
  obs(rajahPlant, 3.815300, 113.781900, '2026-10-01T02:00:00Z'), // older visit of the same plant
  obs(ampullariaPlant, 3.808811, 113.775123, '2026-10-18T02:00:00Z'),
  obs(shoreaFlagged, 3.821444, 113.790777, '2026-10-15T02:00:00Z'),
  obs(shoreaPlant, 3.821444, 113.790777, '2026-10-16T02:00:00Z'),
];

let lastUrl;
beforeEach((t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    lastUrl = new URL(input);
    const speciesId = lastUrl.searchParams.get('specimens.species_id')?.replace('eq.', '');
    const found = rows.filter((r) => !speciesId || r.specimens.species_id === speciesId);
    return new Response(JSON.stringify(found), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

const get = (role, query = '') => request(app).get(`/v1/distribution${query}`).set(as(role));
const byQr = (res) => Object.fromEntries(res.body.data.map((p) => [p.qr_id, p]));

test('asks the database for approved, not-deleted observations only', async () => {
  await get('officer');
  assert.equal(lastUrl.pathname, '/rest/v1/observations');
  assert.equal(lastUrl.searchParams.get('status'), 'eq.approved');
  assert.equal(lastUrl.searchParams.get('is_deleted'), 'eq.false');
  assert.equal(lastUrl.searchParams.get('specimens.is_deleted'), 'eq.false');
});

test('one point per plant, from its latest approved observation', async () => {
  const res = await get('officer');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 4);
  assert.equal(byQr(res)['QR-0001'].observed_at, '2026-10-20T02:00:00Z');
});

test('officer and admin get exact coordinates of endangered plants', async () => {
  for (const role of ['officer', 'admin']) {
    const rajah = byQr(await get(role))['QR-0001'];
    assert.equal(rajah.lat, 3.815372);
    assert.equal(rajah.lng, 113.781946);
    assert.equal(rajah.location_reduced, false);
    assert.equal(rajah.precision_m, 4);
  }
});

test('botanist gets reduced coordinates for endangered plants, never the exact ones', async () => {
  const res = await get('botanist');
  const body = JSON.stringify(res.body);
  for (const exact of ['3.815372', '113.781946', '3.8153', '113.7819', '3.821444', '113.790777']) {
    assert.ok(!body.includes(exact), `exact value ${exact} must not be sent`);
  }
  const rajah = byQr(res)['QR-0001'];
  assert.equal(rajah.location_reduced, true);
  assert.equal(rajah.precision_m, 1100);
  assert.deepEqual([rajah.lat, rajah.lng], [3.815, 113.785]); // centre of its 0.01 degree square
  assert.ok(Math.abs(rajah.lat - 3.815372) <= GRID_DEGREES && Math.abs(rajah.lng - 113.781946) <= GRID_DEGREES);
});

test('the officer\'s endangered flag on one plant also reduces it, whatever the species status', async () => {
  const shorea = byQr(await get('botanist'))['QR-0003'];
  assert.equal(shorea.endangered, true);
  assert.equal(shorea.location_reduced, true);
  assert.deepEqual([shorea.lat, shorea.lng], [3.825, 113.795]);
});

test('vulnerable species automatically reduce coordinates for botanists', async () => {
  const shorea = byQr(await get('botanist'))['QR-0004'];
  assert.equal(shorea.endangered, true);
  assert.equal(shorea.location_reduced, true);
  assert.deepEqual([shorea.lat, shorea.lng], [3.825, 113.795]);
});

test('plants that are not endangered keep their coordinates for every role', async () => {
  const ampullaria = byQr(await get('botanist'))['QR-0002'];
  assert.equal(ampullaria.location_reduced, false);
  assert.deepEqual([ampullaria.lat, ampullaria.lng], [3.808811, 113.775123]);
});

test('filter by species or family', async () => {
  const bySpecies = await get('officer', `?species_id=${RAJAH.id}`);
  assert.deepEqual(bySpecies.body.data.map((p) => p.qr_id), ['QR-0001']);
  const byFamily = await get('officer', '?family=nepenthaceae');
  assert.deepEqual(byFamily.body.data.map((p) => p.qr_id).sort(), ['QR-0001', 'QR-0002']);
  assert.equal((await get('officer', '?species_id=nope')).status, 422);
});

test('visitors (no token) cannot read the distribution data', async () => {
  const res = await request(app).get('/v1/distribution');
  assert.equal(res.status, 401);
});
