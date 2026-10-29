import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// A fake Supabase for read-only searches: fetch answers from the rows below
// and understands the PostgREST filters the search builds (eq, ilike, gte,
// lte and an or of ilikes), so tests run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const verify = async (role) => ({ sub: crypto.randomUUID(), user_role: role });
const app = createApp({ verify });
const as = (role) => ({ Authorization: `Bearer ${role}` });

const species = (scientific_name, common_name, family, conservation_status, created_at, is_published = true) => ({
  id: crypto.randomUUID(), scientific_name, common_name, family, conservation_status, created_at, is_published,
  is_deleted: false, genus: scientific_name.split(' ')[0], description: null, species_media: [],
});

// Nepenthes rajah has two photos; the second is the chosen cover.
const rajah = species('Nepenthes rajah', 'Giant pitcher plant', 'Nepenthaceae', 'Endangered', '2026-10-01T03:00:00Z');
rajah.description = 'Largest pitcher plant.';
rajah.species_media = [
  { s3_bucket: 'species-media', s3_key: `${rajah.id}/m1.jpg`, is_primary: false, sort_order: 0 },
  { s3_bucket: 'species-media', s3_key: `${rajah.id}/m2.jpg`, is_primary: true, sort_order: 1 },
];

const rows = [
  rajah,
  species('Nepenthes ampullaria', 'Flask-shaped pitcher plant', 'Nepenthaceae', 'Least Concern', '2026-10-05T03:00:00Z'),
  species('Rafflesia keithii', 'Keith\'s rafflesia', 'Rafflesiaceae', 'Endangered', '2026-10-10T03:00:00Z'),
  species('Shorea macrophylla', 'Engkabang', 'Dipterocarpaceae', 'Vulnerable', '2026-10-12T03:00:00Z', false),
];

// "ilike" with * as the wildcard, compared without case, like Postgres.
const like = (value, pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(value ?? '');

function matches(row, key, raw) {
  if (key === 'or') {
    const parts = [...raw.matchAll(/(\w+)\.ilike\."([^"]*)"/g)];
    return parts.some(([, col, pattern]) => like(row[col], pattern));
  }
  const [op, ...rest] = raw.split('.');
  const value = rest.join('.');
  if (op === 'eq') return `${row[key]}` === value;
  if (op === 'ilike') return like(row[key], value);
  if (op === 'gte') return row[key] >= value;
  if (op === 'lte') return row[key] <= value;
  return true; // select, order, offset, limit
}

let lastUrl;
beforeEach((t) => {
  lastUrl = undefined;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    lastUrl = url;
    const found = rows.filter((r) => [...url.searchParams].every(([k, v]) => matches(r, k, v)));
    return new Response(JSON.stringify(found), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${found.length - 1}/${found.length}` },
    });
  });
});

const names = (res) => res.body.data.map((s) => s.scientific_name).sort();
const staffSearch = (query) => request(app).get(`/v1/species?${query}`).set(as('officer'));

test('q matches part of the scientific or common name, ignoring case', async () => {
  assert.deepEqual(names(await staffSearch('q=nepen')), ['Nepenthes ampullaria', 'Nepenthes rajah']);
  assert.deepEqual(names(await staffSearch('q=PITCHER')), ['Nepenthes ampullaria', 'Nepenthes rajah']);
  assert.deepEqual(names(await staffSearch('q=engkabang')), ['Shorea macrophylla']);
  assert.equal(
    lastUrl.searchParams.get('or'),
    '(scientific_name.ilike."*engkabang*",common_name.ilike."*engkabang*")',
  );
});

test('filter by family and conservation status, ignoring case', async () => {
  assert.deepEqual(names(await staffSearch('family=nepenthaceae')), ['Nepenthes ampullaria', 'Nepenthes rajah']);
  assert.deepEqual(names(await staffSearch('conservation_status=endangered')), ['Nepenthes rajah', 'Rafflesia keithii']);
  assert.deepEqual(names(await staffSearch('family=Nepenthaceae&conservation_status=Endangered')), ['Nepenthes rajah']);
});

test('filter by the date a species was added, both ends inclusive', async () => {
  assert.deepEqual(names(await staffSearch('created_from=2026-10-05&created_to=2026-10-10')),
    ['Nepenthes ampullaria', 'Rafflesia keithii']);
  assert.equal((await staffSearch('created_from=2026-13-01')).status, 422);
});

test('filters combine with paging and is_published', async () => {
  const res = await staffSearch('conservation_status=Endangered&is_published=true&page=1&limit=1');
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.total, 2);
});

test('search terms cannot inject PostgREST syntax or LIKE wildcards', async () => {
  for (const q of ['a,b', 'x"),is_published.eq.false', '%', 'rajah*', 'a_b', 'a(b)']) {
    const res = await staffSearch(`q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 422, `q=${q} should be rejected`);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }
  assert.equal(lastUrl, undefined, 'nothing reached the database');
  assert.equal((await staffSearch(`q=${encodeURIComponent('Nepenthes × hookeriana')}`)).status, 200);
});

test('botanists cannot use GET /species; they search GET /public/species instead', async () => {
  assert.equal((await request(app).get('/v1/species?q=nep').set(as('botanist'))).status, 403);
  const res = await request(app).get('/v1/public/species?q=nep&family=Nepenthaceae');
  assert.equal(res.status, 200);
  assert.deepEqual(names(res), ['Nepenthes ampullaria', 'Nepenthes rajah']);
});

test('public search only returns published species', async () => {
  const res = await request(app).get('/v1/public/species?q=engkabang');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal((await request(app).get('/v1/public/species?q=%25')).status, 422);
});

// CTIP-26: the botanist's search results need a photo, taxonomy and a short
// description, and the phone loads them a page at a time.
test('public list has genus, description and one cover URL, never the media array', async () => {
  const res = await request(app).get('/v1/public/species?q=rajah');
  assert.equal(res.status, 200);
  const [s] = res.body.data;
  assert.deepEqual(Object.keys(s).sort(), ['common_name', 'conservation_status', 'description', 'family',
    'genus', 'id', 'primary_image_url', 'scientific_name']);
  assert.equal(s.genus, 'Nepenthes');
  assert.equal(s.description, 'Largest pitcher plant.');
  assert.match(s.primary_image_url, /\/storage\/v1\/object\/public\/species-media\/.+\/m2\.jpg$/);
  for (const banned of ['lat', 'lng', 'created_by', 'is_published']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(lastUrl.searchParams.get('select')), `must not select ${banned}`);
  }
});

test('a species with no photo has primary_image_url null', async () => {
  const res = await request(app).get('/v1/public/species?q=ampullaria');
  assert.equal(res.body.data[0].primary_image_url, null);
});

test('without page or limit the public list returns every match (web catalogue)', async () => {
  const res = await request(app).get('/v1/public/species');
  assert.equal(lastUrl.searchParams.get('offset'), null);
  assert.equal(res.body.data.length, 3);
  assert.deepEqual(res.body.meta, { page: 1, limit: 3, total: 3 });
});

test('page and limit page the public list', async () => {
  const res = await request(app).get('/v1/public/species?page=2&limit=5');
  assert.equal(lastUrl.searchParams.get('offset'), '5');
  assert.equal(lastUrl.searchParams.get('limit'), '5');
  assert.deepEqual(res.body.meta, { page: 2, limit: 5, total: 3 });
});

test('public list rejects limit over 100', async () => {
  assert.equal((await request(app).get('/v1/public/species?limit=101')).status, 422);
});
