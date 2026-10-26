import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// A fake Supabase: the real handlers and RBAC run, but fetch answers from an
// in-memory species table, so tests run without the internet. It understands
// just enough PostgREST for these handlers: eq filters, insert, update,
// single / maybeSingle, offset + limit and an exact count.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { officer: crypto.randomUUID(), admin: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (token) => ({ sub: users[token], user_role: token, email: `${token}@gmail.com` });
const app = createApp({ verify });
const as = (role) => ({ Authorization: `Bearer ${role}` });

let table;
const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });

function fakePostgrest(input, init = {}) {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  const filters = [...url.searchParams].filter(([, v]) => v.startsWith('eq.'));
  const matches = (row) => filters.every(([k, v]) => `${row[k]}` === v.slice(3));
  let rows;

  if (method === 'POST') {
    const body = JSON.parse(init.body);
    if (table.some((r) => r.id === body.id)) {
      return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "species_pkey"' });
    }
    if (table.some((r) => r.scientific_name === body.scientific_name)) {
      return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "species_scientific_name_key"' });
    }
    const now = new Date().toISOString();
    const row = { id: crypto.randomUUID(), is_published: false, is_deleted: false, created_at: now, updated_at: now, ...body };
    table.push(row);
    rows = [row];
  } else if (method === 'PATCH') {
    const body = JSON.parse(init.body);
    if (body.scientific_name && table.some((r) => !matches(r) && r.scientific_name === body.scientific_name)) {
      return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "species_scientific_name_key"' });
    }
    rows = table.filter(matches);
    rows.forEach((r) => Object.assign(r, body, { updated_at: new Date().toISOString() }));
  } else {
    rows = table.filter(matches).sort((a, b) => a.scientific_name.localeCompare(b.scientific_name));
  }

  const total = rows.length;
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? rows.length);
  rows = rows.slice(offset, offset + limit).map((r) => ({ ...r }));

  if (headers.get('Accept') === 'application/vnd.pgrst.object+json') {
    if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' });
    return json(200, rows[0]);
  }
  return json(200, rows, { 'Content-Range': `${offset}-${offset + rows.length - 1}/${total}` });
}

beforeEach((t) => {
  table = [];
  t.mock.method(globalThis, 'fetch', fakePostgrest);
});

const create = (body, role = 'officer') => request(app).post('/v1/species').set(as(role)).send(body);

test('officer creates a species: 201, with created_by from the token', async () => {
  const res = await create({ scientific_name: 'Nepenthes rajah', family: 'Nepenthaceae' });
  assert.equal(res.status, 201);
  assert.equal(res.body.scientific_name, 'Nepenthes rajah');
  assert.equal(res.body.created_by, users.officer);
  assert.equal(res.body.is_published, false);
});

test('repeating a create with the same client id returns the existing record, not a duplicate', async () => {
  const id = crypto.randomUUID();
  const first = await create({ id, scientific_name: 'Rafflesia keithii' });
  const again = await create({ id, scientific_name: 'Rafflesia keithii' });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, id);
  assert.equal(table.length, 1);
});

test('a second species with the same scientific name gets 409', async () => {
  await create({ scientific_name: 'Nepenthes rajah' });
  const res = await create({ scientific_name: 'Nepenthes rajah' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'DUPLICATE_SPECIES');
});

test('create is validated with Zod: 422 with the bad fields listed', async () => {
  const res = await create({ scientific_name: '   ', id: 'not-a-uuid' });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  const paths = res.body.details.fields.map((f) => f.path).sort();
  assert.deepEqual(paths, ['id', 'scientific_name']);
});

test('clients cannot set is_published, is_deleted or created_by through create', async () => {
  const res = await create({ scientific_name: 'Nepenthes rajah', is_published: true, created_by: users.admin });
  assert.equal(res.status, 422);
  assert.equal(table.length, 0);
});

test('botanist cannot create, update or delete species', async () => {
  table.push({ id: crypto.randomUUID(), scientific_name: 'Nepenthes rajah', is_deleted: false });
  const id = table[0].id;
  assert.equal((await create({ scientific_name: 'Nepenthes x' }, 'botanist')).status, 403);
  assert.equal((await request(app).patch(`/v1/species/${id}`).set(as('botanist')).send({ family: 'X' })).status, 403);
  assert.equal((await request(app).delete(`/v1/species/${id}`).set(as('botanist'))).status, 403);
  assert.equal(table[0].family, undefined);
  assert.equal(table[0].is_deleted, false);
});

test('read one species, and 404 for unknown or malformed ids', async () => {
  const { body } = await create({ scientific_name: 'Nepenthes rajah' });
  const ok = await request(app).get(`/v1/species/${body.id}`).set(as('admin'));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.id, body.id);
  assert.equal((await request(app).get(`/v1/species/${crypto.randomUUID()}`).set(as('admin'))).status, 404);
  assert.equal((await request(app).get('/v1/species/nope').set(as('admin'))).status, 404);
});

test('list is paged, counts the total, and can filter by is_published', async () => {
  for (const name of ['C species', 'A species', 'B species']) await create({ scientific_name: name });
  table[0].is_published = true;
  const page = await request(app).get('/v1/species?page=2&limit=2').set(as('officer'));
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.data.map((s) => s.scientific_name), ['C species']);
  assert.deepEqual(page.body.meta, { page: 2, limit: 2, total: 3 });
  const published = await request(app).get('/v1/species?is_published=true').set(as('officer'));
  assert.deepEqual(published.body.data.map((s) => s.scientific_name), ['C species']);
  assert.equal((await request(app).get('/v1/species?limit=500').set(as('officer'))).status, 422);
});

test('update changes only the sent fields and records who changed it', async () => {
  const { body } = await create({ scientific_name: 'Nepenthes rajah', family: 'Nepenthaceae' });
  const res = await request(app).patch(`/v1/species/${body.id}`).set(as('admin')).send({ common_name: 'Giant pitcher' });
  assert.equal(res.status, 200);
  assert.equal(res.body.common_name, 'Giant pitcher');
  assert.equal(res.body.family, 'Nepenthaceae');
  assert.equal(res.body.updated_by, users.admin);
});

test('update rejects an empty body and unknown fields', async () => {
  const { body } = await create({ scientific_name: 'Nepenthes rajah' });
  assert.equal((await request(app).patch(`/v1/species/${body.id}`).set(as('admin')).send({})).status, 422);
  assert.equal((await request(app).patch(`/v1/species/${body.id}`).set(as('admin')).send({ is_deleted: true })).status, 422);
});

test('soft delete: 204, the row stays, and it disappears from read, list and update', async () => {
  const { body } = await create({ scientific_name: 'Nepenthes rajah' });
  const del = await request(app).delete(`/v1/species/${body.id}`).set(as('officer'));
  assert.equal(del.status, 204);
  assert.equal(table.length, 1);
  assert.equal(table[0].is_deleted, true);
  assert.equal((await request(app).get(`/v1/species/${body.id}`).set(as('officer'))).status, 404);
  assert.equal((await request(app).get('/v1/species').set(as('officer'))).body.meta.total, 0);
  assert.equal((await request(app).patch(`/v1/species/${body.id}`).set(as('officer')).send({ family: 'X' })).status, 404);
  assert.equal((await request(app).delete(`/v1/species/${body.id}`).set(as('officer'))).status, 404);
});
