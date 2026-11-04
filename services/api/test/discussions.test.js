import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Discussion board endpoints against a fake Supabase. The fake plays the read
// rule of the migration (owner, public, or shared with you or your role) and
// the two functions, so the API's own guards are tested without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { botanist: crypto.randomUUID(), other: crypto.randomUUID(), officer: crypto.randomUUID(), admin: crypto.randomUUID() };
const roleOf = { botanist: 'botanist', other: 'botanist', officer: 'officer', admin: 'admin' };
const verify = async (who) => ({ sub: users[who], user_role: roleOf[who] });
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });

let discussions, audience, posts, rpcCalls;

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const canSee = (d, me) => d.owner_id === me.id || d.visibility === 'public' ||
  audience.some((a) => a.discussion_id === d.id && (a.user_id === me.id || a.role === me.role));

function createDiscussion(args, me) {
  if (discussions.some((d) => d.id === args.p_id)) return json(409, { code: '23505', message: 'duplicate key' });
  const d = { id: args.p_id ?? crypto.randomUUID(), title: args.p_title, owner_id: me.id, visibility: args.p_visibility,
    observation_id: args.p_observation_id, created_at: new Date().toISOString() };
  discussions.push(d);
  for (const u of args.p_user_ids) if (u !== me.id) audience.push({ id: crypto.randomUUID(), discussion_id: d.id, user_id: u, role: null });
  for (const r of args.p_roles) audience.push({ id: crypto.randomUUID(), discussion_id: d.id, user_id: null, role: r });
  posts.push({ id: crypto.randomUUID(), discussion_id: d.id, author_id: me.id, body: args.p_body, mentions: args.p_mentions });
  return json(200, d);
}

beforeEach((t) => {
  discussions = [];
  audience = [];
  posts = [];
  rpcCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const who = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    const me = { id: users[who], role: roleOf[who] };

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.replace('/rest/v1/rpc/', '');
      const args = JSON.parse(init.body);
      rpcCalls.push({ name, args });
      if (name === 'create_discussion') return createDiscussion(args, me);
      if (name === 'update_discussion') {
        const d = discussions.find((x) => x.id === args.p_id && x.owner_id === me.id);
        if (!d) return json(403, { code: '42501', message: 'Only the owner can change this discussion' });
        if (args.p_visibility) d.visibility = args.p_visibility;
        if (args.p_title) d.title = args.p_title;
        return json(200, d);
      }
      return json(404, { message: 'no such function' });
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const eq = Object.fromEntries([...url.searchParams].filter(([k]) => !['select', 'order'].includes(k))
      .map(([k, v]) => [k, v.replace(/^eq\./, '')]));
    const visibleThread = (id) => discussions.find((d) => d.id === id && canSee(d, me));
    let rows;
    if (table === 'discussions') {
      rows = discussions.filter((d) => canSee(d, me) && (!eq.id || d.id === eq.id));
      if (method === 'DELETE') {
        rows = rows.filter((d) => d.owner_id === me.id || me.role === 'admin');
        discussions = discussions.filter((d) => !rows.includes(d));
      }
    } else if (table === 'discussion_audience') {
      rows = audience.filter((a) => a.discussion_id === eq.discussion_id && visibleThread(a.discussion_id));
    } else if (table === 'discussion_posts') {
      if (method === 'POST') {
        const row = JSON.parse(init.body);
        if (posts.some((p) => p.id === row.id)) return json(409, { code: '23505', message: 'duplicate key' });
        if (row.author_id !== me.id || !visibleThread(row.discussion_id)) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
        rows = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }];
        posts.push(...rows);
      } else {
        rows = posts.filter((p) => visibleThread(p.discussion_id) && (!eq.id || p.id === eq.id) &&
          (!eq.discussion_id || p.discussion_id === eq.discussion_id));
      }
    } else return json(404, { message: `no table ${table}` });

    if (new Headers(init.headers).get('Accept') === 'application/vnd.pgrst.object+json') {
      if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' });
      return json(200, rows[0]);
    }
    return json(200, rows);
  });
});

const start = (who, fields = {}) => request(app).post('/v1/discussions').set(as(who))
  .send({ title: 'Nepenthes near trail 3', body: 'Has anyone seen flowers yet?', share_roles: ['officer'], ...fields });

test('start a private thread shared with a group and a person: 201 with audience and first post', async () => {
  const res = await start('botanist', { share_users: [users.other], mentions: [users.other] });
  assert.equal(res.status, 201);
  assert.equal(res.body.owner_id, users.botanist);
  assert.equal(res.body.visibility, 'private');
  assert.equal(res.body.posts.length, 1);
  assert.equal(res.body.audience.length, 2);
  const { args } = rpcCalls.find((c) => c.name === 'create_discussion');
  assert.deepEqual(args.p_roles, ['officer']);
  assert.deepEqual(args.p_user_ids, [users.other]);
  assert.deepEqual(args.p_mentions, [users.other]);
});

test('a private thread must be shared with someone; a public one need not be', async () => {
  const empty = await start('botanist', { share_roles: [] });
  assert.equal(empty.status, 422);
  const open = await start('botanist', { share_roles: [], visibility: 'public' });
  assert.equal(open.status, 201);
});

test('bad recipients are refused: unknown role, ids that are not UUIDs, extra fields', async () => {
  assert.equal((await start('botanist', { share_roles: ['visitor'] })).status, 422);
  assert.equal((await start('botanist', { share_users: ['bob'] })).status, 422);
  assert.equal((await start('botanist', { owner_id: users.admin })).status, 422);
});

test('sending the same thread again (retry) returns it with 200, not a second thread', async () => {
  const id = crypto.randomUUID();
  assert.equal((await start('botanist', { id })).status, 201);
  const again = await start('botanist', { id });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, id);
  assert.equal(discussions.length, 1);
});

test('a private thread is 404 to someone it is not shared with, and readable to its group', async () => {
  const { body } = await start('botanist');
  assert.equal((await request(app).get(`/v1/discussions/${body.id}`).set(as('other'))).status, 404);
  const officer = await request(app).get(`/v1/discussions/${body.id}`).set(as('officer'));
  assert.equal(officer.status, 200);
  assert.equal(officer.body.posts.length, 1);
});

test('a public thread can be read and replied to by any staff member', async () => {
  const { body } = await start('botanist', { visibility: 'public', share_roles: [] });
  const reply = await request(app).post(`/v1/discussions/${body.id}/posts`).set(as('other')).send({ body: 'Not yet' });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.author_id, users.other);
});

test('replying to a thread you cannot see answers 404', async () => {
  const { body } = await start('botanist');
  const res = await request(app).post(`/v1/discussions/${body.id}/posts`).set(as('other')).send({ body: 'hello' });
  assert.equal(res.status, 404);
  assert.equal(posts.length, 1);
});

test('only the owner changes visibility and audience', async () => {
  const { body } = await start('botanist');
  const officer = await request(app).patch(`/v1/discussions/${body.id}`).set(as('officer')).send({ visibility: 'public' });
  assert.equal(officer.status, 403);
  assert.equal(officer.body.code, 'NOT_OWNER');
  const owner = await request(app).patch(`/v1/discussions/${body.id}`).set(as('botanist'))
    .send({ visibility: 'public', share_roles: ['admin'] });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.visibility, 'public');
  const { args } = rpcCalls.find((c) => c.name === 'update_discussion');
  assert.deepEqual(args.p_roles, ['admin']);
  assert.equal(args.p_user_ids, null, 'left out means unchanged');
});

test('delete: not by another member, yes by an admin', async () => {
  const { body } = await start('botanist', { share_roles: ['officer', 'admin'] });
  assert.equal((await request(app).delete(`/v1/discussions/${body.id}`).set(as('officer'))).status, 403);
  assert.equal((await request(app).delete(`/v1/discussions/${body.id}`).set(as('admin'))).status, 204);
  assert.equal(discussions.length, 0);
});

test('visitors cannot use the board', async () => {
  const res = await request(app).post('/v1/discussions').send({ title: 'x', body: 'y', visibility: 'public' });
  assert.equal(res.status, 401);
});
