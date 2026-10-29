import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// A fake Supabase with a few in-memory tables, so the field and staff
// endpoints run for real without the internet. It understands eq / neq / is
// filters, limit, insert (one row or many), update, delete, single /
// maybeSingle, and the Storage calls these handlers make.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { officer: crypto.randomUUID(), admin: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (token) => ({ sub: users[token], user_role: token, email: `${token}@gmail.com` });
const app = createApp({ verify });
const as = (role) => ({ Authorization: `Bearer ${role}` });

const KEYS = { qr_tags: 'qr_id' };
let db; // { table: rows[] }
let failing; // tables whose reads answer an error
let stored; // Storage paths uploaded

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const pgError = (code, message) => json(409, { code, message });

function checkInsert(table, row) {
  const key = KEYS[table] ?? 'id';
  if (db[table].some((r) => r[key] === row[key])) return pgError('23505', `duplicate key value violates unique constraint "${table}_pkey"`);
  if (table === 'specimens') {
    if (db.specimens.some((r) => r.qr_id === row.qr_id)) return pgError('23505', 'duplicate key value violates unique constraint "specimens_qr_id_key"');
    if (!db.qr_tags.some((t) => t.qr_id === row.qr_id)) return pgError('23503', 'violates foreign key constraint "specimens_qr_id_fkey"');
  }
  return null;
}

async function fakeSupabase(input, init = {}) {
  const url = new URL(input);
  const method = init.method ?? 'GET';

  if (url.pathname.startsWith('/storage/v1/object/sign/')) {
    const { paths } = JSON.parse(init.body);
    return json(200, paths.map((path) => ({ path, signedURL: `/object/sign/observation-photos/${path}?token=t`, error: null })));
  }
  if (url.pathname.startsWith('/storage/v1/object/observation-photos/') && method === 'POST') {
    const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/observation-photos/', ''));
    stored.push(key);
    return json(200, { Key: `observation-photos/${key}` });
  }

  const table = url.pathname.replace('/rest/v1/', '');
  if (!db[table]) return json(404, { message: `no table ${table}` });
  if (failing.includes(table) && method === 'GET') return json(500, { code: 'XX000', message: `${table} is down` });

  const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k));
  const matches = (row) => filters.every(([k, v]) => {
    const [op, ...rest] = v.split('.');
    const want = rest.join('.');
    if (op === 'eq') return `${row[k]}` === want;
    if (op === 'neq') return `${row[k]}` !== want;
    if (op === 'ilike') return `${row[k]}`.toLowerCase() === want.toLowerCase();
    return true;
  });

  let rows;
  if (method === 'POST') {
    const body = JSON.parse(init.body);
    const list = Array.isArray(body) ? body : [body];
    for (const row of list) {
      const err = checkInsert(table, row);
      if (err) return err;
    }
    const now = new Date().toISOString();
    rows = list.map((r) => ({ id: crypto.randomUUID(), created_at: now, ...r }));
    db[table].push(...rows);
  } else if (method === 'PATCH') {
    rows = db[table].filter(matches);
    rows.forEach((r) => Object.assign(r, JSON.parse(init.body)));
  } else if (method === 'DELETE') {
    rows = db[table].filter(matches);
    db[table] = db[table].filter((r) => !matches(r));
  } else {
    rows = db[table].filter(matches);
  }
  const limit = url.searchParams.get('limit');
  if (limit) rows = rows.slice(0, Number(limit));
  rows = rows.map((r) => ({ ...r }));

  if (new Headers(init.headers).get('Accept') === 'application/vnd.pgrst.object+json') {
    if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' });
    return json(200, rows[0]);
  }
  return json(200, rows);
}

beforeEach((t) => {
  db = {
    qr_tags: [], specimens: [], observations: [], observation_photos: [], observation_comments: [],
    observation_reviews: [], species: [], species_media: [], alerts: [], alert_notes: [], sensor_nodes: [],
    notifications: [], audit_logs: [], profiles: [],
  };
  failing = [];
  stored = [];
  t.mock.method(globalThis, 'fetch', fakeSupabase);
});

const tag = (qr_id, status = 'unassigned') => db.qr_tags.push({ qr_id, status });
const observation = (fields = {}) => {
  const row = { id: crypto.randomUUID(), specimen_id: crypto.randomUUID(), recorded_by: users.botanist,
    status: 'synced', version: 1, is_deleted: false, ...fields };
  db.observations.push(row);
  return row;
};

/* ---------- specimens ---------- */

test('botanist registers a plant on an unused tag: 201, registered_by from the token', async () => {
  tag('NIAH-0001');
  const res = await request(app).post('/v1/specimens').set(as('botanist')).send({ qr_id: 'NIAH-0001', lat: 3.8, lng: 113.7 });
  assert.equal(res.status, 201);
  assert.equal(res.body.registered_by, users.botanist);
  assert.equal(res.body.species_id, null);
});

test('sending the same plant again (retry) returns it with 200, not a second plant', async () => {
  tag('NIAH-0001');
  const id = crypto.randomUUID();
  const body = { id, qr_id: 'NIAH-0001' };
  assert.equal((await request(app).post('/v1/specimens').set(as('botanist')).send(body)).status, 201);
  const again = await request(app).post('/v1/specimens').set(as('botanist')).send(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, id);
  assert.equal(db.specimens.length, 1);
});

test('a tag already on another plant gets 409 TAG_IN_USE; an unknown tag 422 TAG_NOT_FOUND', async () => {
  tag('NIAH-0001');
  await request(app).post('/v1/specimens').set(as('botanist')).send({ qr_id: 'NIAH-0001' });
  const taken = await request(app).post('/v1/specimens').set(as('officer')).send({ qr_id: 'NIAH-0001' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'TAG_IN_USE');
  const unknown = await request(app).post('/v1/specimens').set(as('botanist')).send({ qr_id: 'NIAH-9999' });
  assert.equal(unknown.status, 422);
  assert.equal(unknown.body.code, 'TAG_NOT_FOUND');
});

test('clients cannot set registered_by or species_id when registering', async () => {
  tag('NIAH-0001');
  const res = await request(app).post('/v1/specimens').set(as('botanist'))
    .send({ qr_id: 'NIAH-0001', registered_by: users.admin, species_id: crypto.randomUUID() });
  assert.equal(res.status, 422);
  assert.equal(db.specimens.length, 0);
});

/* ---------- observations ---------- */

test('new observation: recorded_by from the token, version 1, waiting for review', async () => {
  const res = await request(app).post('/v1/observations').set(as('botanist'))
    .send({ specimen_id: crypto.randomUUID(), height_cm: 42, notes: 'pitchers forming' });
  assert.equal(res.status, 201);
  assert.equal(res.body.recorded_by, users.botanist);
  assert.equal(res.body.version, 1);
  assert.equal(res.body.status, 'synced');
  assert.ok(res.body.last_synced_at);
});

test('an observation cannot be created already approved', async () => {
  const res = await request(app).post('/v1/observations').set(as('botanist'))
    .send({ specimen_id: crypto.randomUUID(), status: 'approved' });
  assert.equal(res.status, 422);
});

test('submit a draft: becomes synced, version unchanged', async () => {
  const obs = observation({ status: 'draft' });
  const res = await request(app).post(`/v1/observations/${obs.id}/submit`).set(as('botanist')).send({});
  assert.equal(res.status, 200);
  assert.equal(db.observations[0].status, 'synced');
  assert.equal(db.observations[0].version, 1);
});

test('resubmit a returned record: fixes saved, version goes up, reply posted', async () => {
  const obs = observation({ status: 'returned', version: 2, height_cm: 10 });
  const res = await request(app).post(`/v1/observations/${obs.id}/submit`).set(as('botanist'))
    .send({ height_cm: 12, comment: 'Measured again' });
  assert.equal(res.status, 200);
  assert.equal(db.observations[0].status, 'synced');
  assert.equal(db.observations[0].version, 3);
  assert.equal(db.observations[0].height_cm, 12);
  assert.equal(db.observation_comments.length, 1);
  assert.equal(db.observation_comments[0].author_id, users.botanist);
});

test('a decided record cannot be submitted again: 409 WRONG_STATUS', async () => {
  const obs = observation({ status: 'approved' });
  const res = await request(app).post(`/v1/observations/${obs.id}/submit`).set(as('botanist')).send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'WRONG_STATUS');
});

test("a botanist cannot submit another botanist's record", async () => {
  const obs = observation({ status: 'draft', recorded_by: crypto.randomUUID() });
  const res = await request(app).post(`/v1/observations/${obs.id}/submit`).set(as('botanist')).send({});
  assert.equal(res.status, 404);
});

test('photo upload: stored at {observation_id}/{photo_id}.jpg, row saved, signed link returned', async () => {
  const obs = observation();
  const photoId = crypto.randomUUID();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const res = await request(app).post(`/v1/observations/${obs.id}/photos`).set(as('botanist'))
    .field('id', photoId).attach('file', jpeg, 'leaf.jpg');
  assert.equal(res.status, 201);
  assert.deepEqual(stored, [`${obs.id}/${photoId}.jpg`]);
  assert.equal(db.observation_photos[0].upload_status, 'uploaded');
  assert.match(res.body.url, /observation-photos/);

  const again = await request(app).post(`/v1/observations/${obs.id}/photos`).set(as('botanist'))
    .field('id', photoId).attach('file', jpeg, 'leaf.jpg');
  assert.equal(again.status, 200, 'a retry with the same photo id is not saved twice');
  assert.equal(db.observation_photos.length, 1);
});

test('photo upload rejects a file that is not an image, whatever its name', async () => {
  const obs = observation();
  const res = await request(app).post(`/v1/observations/${obs.id}/photos`).set(as('botanist'))
    .attach('file', Buffer.from('#!/bin/sh\necho hi'), 'photo.jpg');
  assert.equal(res.status, 415);
  assert.equal(db.observation_photos.length, 0);
});

test('comment: author from the token', async () => {
  const obs = observation();
  const res = await request(app).post(`/v1/observations/${obs.id}/comments`).set(as('officer')).send({ body: 'Check the leaf base' });
  assert.equal(res.status, 201);
  assert.equal(res.body.author_id, users.officer);
});

/* ---------- QR tags ---------- */

test('tag batch: next ids after the highest one, created_by from the token', async () => {
  tag('NIAH-0007');
  const res = await request(app).post('/v1/qr-tags/batch').set(as('officer')).send({ count: 2, batch_label: 'Print 3' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.map((t) => t.qr_id), ['NIAH-0008', 'NIAH-0009']);
  assert.ok(res.body.every((t) => t.created_by === users.officer && t.status === 'unassigned'));
});

test('botanist can create one tag for a plant, but not a batch', async () => {
  const one = await request(app).post('/v1/qr-tags/batch').set(as('botanist')).send({ count: 1, batch_label: 'field' });
  assert.equal(one.status, 201);
  assert.equal(one.body[0].created_by, users.botanist);
  const batch = await request(app).post('/v1/qr-tags/batch').set(as('botanist')).send({ count: 5, batch_label: 'field' });
  assert.equal(batch.status, 403);
  assert.equal(db.qr_tags.length, 1);
});

test('a tag on a plant cannot be deleted (409); an unused one can (204)', async () => {
  tag('NIAH-0001');
  tag('NIAH-0002');
  db.specimens.push({ id: crypto.randomUUID(), qr_id: 'NIAH-0001' });
  assert.equal((await request(app).delete('/v1/qr-tags/NIAH-0001').set(as('officer'))).status, 409);
  assert.equal((await request(app).delete('/v1/qr-tags/NIAH-0002').set(as('officer'))).status, 204);
  assert.deepEqual(db.qr_tags.map((t) => t.qr_id), ['NIAH-0001']);
});

/* ---------- start-up load ---------- */

test('workspace: every list, with signed links on field photos', async () => {
  const obs = observation();
  db.observation_photos.push({ id: crypto.randomUUID(), observation_id: obs.id, s3_bucket: 'observation-photos', s3_key: `${obs.id}/a.jpg` });
  const res = await request(app).get('/v1/workspace').set(as('officer'));
  assert.equal(res.status, 200);
  assert.equal(res.body.observations.length, 1);
  assert.match(res.body.observation_photos[0].url, /token=t/);
  assert.deepEqual(res.body.unavailable, []);
});

test('workspace: a side list that fails comes back empty and named; a core list fails the request', async () => {
  failing = ['audit_logs'];
  const partial = await request(app).get('/v1/workspace').set(as('botanist'));
  assert.equal(partial.status, 200);
  assert.deepEqual(partial.body.unavailable, ['audit_logs']);

  failing = ['specimens'];
  const broken = await request(app).get('/v1/workspace').set(as('botanist'));
  assert.equal(broken.status, 500, 'no plants would show every tag as unused');
});

test('visitor workspace needs no token and holds only species and their photos', async () => {
  db.observations.push({ id: crypto.randomUUID() });
  const res = await request(app).get('/v1/public/workspace');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.observations, []);
  assert.deepEqual(res.body.specimens, []);
});

/* ---------- endangered locations (CTIP-71, threat T13) ---------- */

// An endangered plant registered by someone other than the caller, at a spot
// that is not on the 0.01 degree grid.
const EXACT = { lat: 3.81234, lng: 113.78123 };
const species = (conservation_status) => {
  const row = { id: crypto.randomUUID(), scientific_name: 'Nepenthes test', conservation_status, is_deleted: false };
  db.species.push(row);
  return row;
};
const plant = (fields = {}) => {
  const row = { id: crypto.randomUUID(), qr_id: 'NIAH-0099', species_id: null, registered_by: crypto.randomUUID(),
    endangered_override: false, is_deleted: false, gps_accuracy_m: 4, ...EXACT, ...fields };
  db.specimens.push(row);
  return row;
};
const onGrid = (v) => Math.abs(((v / 0.01) % 1) - 0.5) < 1e-6;
const workspacePlant = async (role) => (await request(app).get('/v1/workspace').set(as(role))).body.specimens[0];

test("workspace: another botanist's endangered plant comes back reduced", async () => {
  plant({ species_id: species('endangered').id });
  const p = await workspacePlant('botanist');
  assert.notEqual(p.lat, EXACT.lat);
  assert.notEqual(p.lng, EXACT.lng);
  assert.ok(onGrid(p.lat) && onGrid(p.lng), 'snapped to the grid used by /distribution');
  assert.equal(p.gps_accuracy_m, 1100);
  assert.equal(p.location_reduced, true);
});

test('workspace: officer sees exact', async () => {
  plant({ species_id: species('endangered').id });
  const p = await workspacePlant('officer');
  assert.equal(p.lat, EXACT.lat);
  assert.equal(p.lng, EXACT.lng);
  assert.equal(p.location_reduced, false);
});

test('workspace: own plant stays exact', async () => {
  plant({ species_id: species('endangered').id, registered_by: users.botanist });
  const p = await workspacePlant('botanist');
  assert.equal(p.lat, EXACT.lat);
  assert.equal(p.location_reduced, false);
});

test('workspace: null coordinates stay null', async () => {
  plant({ species_id: species('endangered').id, lat: null, lng: null });
  const p = await workspacePlant('botanist');
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
});

test('workspace: override and capitalised status both reduce', async () => {
  plant({ endangered_override: true });
  plant({ qr_id: 'NIAH-0098', species_id: species('Critically Endangered').id });
  plant({ qr_id: 'NIAH-0097', species_id: species('least concern').id });
  const res = await request(app).get('/v1/workspace').set(as('botanist'));
  const byTag = Object.fromEntries(res.body.specimens.map((p) => [p.qr_id, p]));
  assert.equal(byTag['NIAH-0099'].location_reduced, true, 'override with no species');
  assert.equal(byTag['NIAH-0098'].location_reduced, true, 'status in capitals');
  assert.equal(byTag['NIAH-0097'].lat, EXACT.lat, 'not endangered stays exact');
});

test('workspace: a species the botanist cannot see (unpublished) counts as endangered', async () => {
  // RLS only shows botanists published species, so the status is unknown here.
  plant({ species_id: crypto.randomUUID() });
  const p = await workspacePlant('botanist');
  assert.equal(p.location_reduced, true, 'unknown status fails closed');
});

test("by-qr reduces another botanist's endangered plant", async () => {
  plant({ species_id: species('endangered').id });
  const res = await request(app).get('/v1/specimens/by-qr/NIAH-0099').set(as('botanist'));
  assert.equal(res.status, 200);
  assert.notEqual(res.body.lat, EXACT.lat);
  assert.equal(res.body.location_reduced, true);
  const officer = await request(app).get('/v1/specimens/by-qr/NIAH-0099').set(as('officer'));
  assert.equal(officer.body.lat, EXACT.lat);
});

/* ---------- accounts, notifications ---------- */

test('an admin cannot change their own role or turn off their own account', async () => {
  db.profiles.push({ id: users.admin, role: 'admin', is_active: true });
  const res = await request(app).patch(`/v1/profiles/${users.admin}`).set(as('admin')).send({ role: 'botanist' });
  assert.equal(res.status, 422);
  assert.equal(db.profiles[0].role, 'admin');
});

test('PATCH /me cannot change role', async () => {
  const res = await request(app).patch('/v1/me').set(as('botanist')).send({ role: 'admin' });
  assert.equal(res.status, 422);
});

test("marking a notification read only touches the caller's own", async () => {
  const mine = { id: crypto.randomUUID(), user_id: users.botanist, is_read: false };
  const theirs = { id: crypto.randomUUID(), user_id: users.officer, is_read: false };
  db.notifications.push(mine, theirs);
  assert.equal((await request(app).post(`/v1/notifications/${theirs.id}/read`).set(as('botanist'))).status, 404);
  assert.equal((await request(app).post('/v1/notifications/read-all').set(as('botanist'))).status, 204);
  assert.deepEqual(db.notifications.map((n) => n.is_read), [true, false]);
});
