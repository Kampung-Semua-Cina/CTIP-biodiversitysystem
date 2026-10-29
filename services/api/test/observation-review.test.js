import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// A fake Supabase: fetch answers from in-memory observations and reviews, and
// plays public.review_observation() (same checks and error codes as the
// migration), so tests run without the internet. RLS is not simulated: these
// tests check the API's own guards.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { botanist: crypto.randomUUID(), other: crypto.randomUUID(), officer: crypto.randomUUID(), admin: crypto.randomUUID() };
const roleOf = { botanist: 'botanist', other: 'botanist', officer: 'officer', admin: 'admin' };
const verify = async (who) => ({ sub: users[who], user_role: roleOf[who] });
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });

let observations, reviews, rpcCalls;
// has_species stands in for "the plant is linked to a species that is not deleted".
const obs = (status, recorded_by, observed_at, version = 1, has_species = true) =>
  ({ id: crypto.randomUUID(), specimen_id: crypto.randomUUID(), recorded_by, observed_at, status, version, is_deleted: false, has_species });

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function reviewObservation({ p_obs_id, p_version, p_decision, p_comment }, reviewer) {
  if (!['officer', 'admin'].includes(reviewer.role)) return json(403, { code: '42501', message: 'Only officers and admins can review observations' });
  if (p_decision !== 'approve' && !p_comment?.trim()) return json(400, { code: 'CTRQ0', message: 'A reason is required' });
  const o = observations.find((x) => x.id === p_obs_id && !x.is_deleted);
  if (!o) return json(400, { code: 'CTNF0', message: 'Observation not found' });
  if (o.status !== 'synced') return json(400, { code: 'CTST0', message: `Observation is ${o.status}, not waiting for review` });
  if (o.version !== p_version) return json(400, { code: 'CTVR0', message: `Observation changed since you opened it (now version ${o.version})` });
  if (p_decision === 'approve' && !o.has_species) return json(400, { code: 'CTSP0', message: 'Confirm the species before approving' });
  const review = { id: crypto.randomUUID(), observation_id: o.id, reviewer_id: reviewer.id, observation_version: o.version,
    decision: p_decision, comment: p_comment, created_at: new Date().toISOString() };
  reviews.push(review);
  o.status = { approve: 'approved', return: 'returned', reject: 'rejected' }[p_decision];
  return json(200, review);
}

beforeEach((t) => {
  observations = [
    obs('synced', users.botanist, '2026-10-02T00:00:00Z'),
    obs('synced', users.other, '2026-10-01T00:00:00Z', 3),
    obs('draft', users.botanist, '2026-10-03T00:00:00Z'),
    obs('approved', users.other, '2026-09-30T00:00:00Z'),
  ];
  reviews = [];
  rpcCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const bearer = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    const who = Object.keys(users).find((k) => k === bearer);
    if (url.pathname === '/rest/v1/rpc/review_observation') {
      const args = JSON.parse(init.body);
      rpcCalls.push(args);
      return reviewObservation(args, { id: users[who], role: roleOf[who] });
    }
    const table = url.pathname === '/rest/v1/observations' ? observations : reviews;
    const filters = [...url.searchParams].filter(([, v]) => v.startsWith('eq.'));
    let rows = table.filter((r) => filters.every(([k, v]) => `${r[k]}` === v.slice(3)));
    const [col, dir] = (url.searchParams.get('order') ?? 'id.asc').split('.');
    rows = rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * `${a[col]}`.localeCompare(`${b[col]}`));
    const total = rows.length;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    rows = rows.slice(offset, offset + Number(url.searchParams.get('limit') ?? rows.length));
    return json(200, rows, { 'Content-Range': `${offset}-${offset + rows.length - 1}/${total}` });
  });
});

const review = (who, id, body) => request(app).post(`/v1/observations/${id}/reviews`).set(as(who)).send(body);

test('officer lists the pending review queue, oldest first', async () => {
  const res = await request(app).get('/v1/observations?status=pending').set(as('officer'));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((o) => o.observed_at), ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
  assert.equal(res.body.meta.total, 2);
});

test('a botanist only sees their own observations and their status', async () => {
  const res = await request(app).get('/v1/observations').set(as('botanist'));
  assert.equal(res.status, 200);
  assert.ok(res.body.data.every((o) => o.recorded_by === users.botanist));
  assert.deepEqual(res.body.data.map((o) => o.status).sort(), ['draft', 'synced']);
  const others = observations[1].id;
  assert.equal((await request(app).get(`/v1/observations/${others}`).set(as('botanist'))).status, 404);
  assert.equal((await request(app).get(`/v1/observations/${others}/reviews`).set(as('botanist'))).status, 404);
});

test('officer approves: 201, status becomes approved, reviewer and time recorded', async () => {
  const target = observations[0];
  const res = await review('officer', target.id, { decision: 'approve', observation_version: 1 });
  assert.equal(res.status, 201);
  assert.equal(res.body.reviewer_id, users.officer);
  assert.ok(res.body.created_at);
  assert.equal(target.status, 'approved');
  assert.deepEqual(rpcCalls[0], { p_obs_id: target.id, p_version: 1, p_decision: 'approve', p_comment: null });
});

test('reject and request changes need a reason', async () => {
  const target = observations[1];
  for (const decision of ['reject', 'return']) {
    const res = await review('admin', target.id, { decision, observation_version: 3 });
    assert.equal(res.status, 422);
    assert.equal(res.body.details.fields[0].path, 'comment');
  }
  assert.deepEqual(rpcCalls, []);
  const ok = await review('admin', target.id, { decision: 'return', observation_version: 3, comment: 'Photo is blurry, please retake' });
  assert.equal(ok.status, 201);
  assert.equal(target.status, 'returned');
});

test('the botanist can read why their observation was returned', async () => {
  const mine = observations[0];
  await review('officer', mine.id, { decision: 'return', observation_version: 1, comment: 'Add a leaf photo' });
  const res = await request(app).get(`/v1/observations/${mine.id}/reviews`).set(as('botanist'));
  assert.equal(res.status, 200);
  assert.equal(res.body[0].decision, 'return');
  assert.equal(res.body[0].comment, 'Add a leaf photo');
  assert.equal((await request(app).get(`/v1/observations/${mine.id}`).set(as('botanist'))).body.status, 'returned');
});

test('stale version gets 409 VERSION_CONFLICT; already reviewed or draft gets 409 WRONG_STATUS', async () => {
  const stale = await review('officer', observations[1].id, { decision: 'approve', observation_version: 2 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');
  const draft = await review('officer', observations[2].id, { decision: 'approve', observation_version: 1 });
  assert.equal(draft.status, 409);
  assert.equal(draft.body.code, 'WRONG_STATUS');
  await review('officer', observations[0].id, { decision: 'approve', observation_version: 1 });
  const twice = await review('admin', observations[0].id, { decision: 'reject', observation_version: 1, comment: 'no' });
  assert.equal(twice.body.code, 'WRONG_STATUS');
  assert.equal(reviews.length, 1);
});

test('unknown observation gets 404; bad body gets 422', async () => {
  assert.equal((await review('officer', crypto.randomUUID(), { decision: 'approve', observation_version: 1 })).status, 404);
  assert.equal((await review('officer', observations[0].id, { decision: 'maybe', observation_version: 1 })).status, 422);
  assert.equal((await review('officer', observations[0].id, { decision: 'approve' })).status, 422);
  assert.equal((await review('officer', observations[0].id, { decision: 'approve', observation_version: 1, reviewer_id: users.admin })).status, 422);
});

test('botanists cannot review, not even their own observation', async () => {
  const res = await review('botanist', observations[0].id, { decision: 'approve', observation_version: 1 });
  assert.equal(res.status, 403);
  assert.deepEqual(rpcCalls, []);
  assert.equal(observations[0].status, 'synced');
});

test('approving needs a confirmed species: 422 SPECIES_REQUIRED, while return and reject still work', async () => {
  const unnamed = obs('synced', users.botanist, '2026-10-04T00:00:00Z', 1, false);
  observations.push(unnamed);
  const res = await review('officer', unnamed.id, { decision: 'approve', observation_version: 1 });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'SPECIES_REQUIRED');
  assert.equal(unnamed.status, 'synced');
  assert.equal(reviews.length, 0);
  const back = await review('officer', unnamed.id, { decision: 'return', observation_version: 1, comment: 'Which species is it?' });
  assert.equal(back.status, 201);
  assert.equal(unnamed.status, 'returned');
});
