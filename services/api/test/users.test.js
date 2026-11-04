import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetEmailLimit, emailLimitInfo, recordEmailSent } from '../src/emailLimit.js';
import { resetPurgeClock } from '../src/staff.js';

// Deleting users (30 days to restore) and Supabase's email limit, against a
// fake Supabase: a profiles table, the two database functions, and Auth's
// sign-up and password-reset endpoints.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { admin: crypto.randomUUID(), admin2: crypto.randomUUID(), botanist: crypto.randomUUID() };
const roleOf = { admin: 'admin', admin2: 'admin', botanist: 'botanist' };
const verify = async (who) => ({ sub: users[who], user_role: roleOf[who] });
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });

let profiles, rpcCalls, authAnswer, authCalls;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const RATE_LIMITED = () => json(429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });

beforeEach((t) => {
  resetEmailLimit();
  resetPurgeClock();
  profiles = [
    { id: users.admin, full_name: 'Ada', role: 'admin', is_active: true, deleted_at: null },
    { id: users.botanist, full_name: 'Ben', role: 'botanist', is_active: true, deleted_at: null },
  ];
  rpcCalls = [];
  authAnswer = { signup: null, recover: null }; // null: success
  authCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    if (url.pathname.startsWith('/auth/v1/')) authCalls.push(url.pathname.replace('/auth/v1/', ''));
    if (url.pathname === '/auth/v1/signup') {
      if (authAnswer.signup) return authAnswer.signup();
      const id = crypto.randomUUID();
      // handle_new_user() makes the profile row
      profiles.push({ id, email: JSON.parse(init.body).email, role: 'botanist', is_active: true, deleted_at: null });
      return json(200, { id, email: JSON.parse(init.body).email, confirmation_sent_at: new Date().toISOString(), identities: [{ id }] });
    }
    if (url.pathname === '/auth/v1/recover') return authAnswer.recover ? authAnswer.recover() : json(200, {});
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      rpcCalls.push({ name: url.pathname.replace('/rest/v1/rpc/', ''), args: JSON.parse(init.body || '{}') });
      return json(200, 0);
    }
    if (url.pathname !== '/rest/v1/profiles') return json(404, { message: 'no table' });
    const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit'].includes(k));
    const matches = (r, k, v) => (v.startsWith('ilike.')
      ? `${r[k]}`.toLowerCase() === v.slice(6).replace(/\\(.)/g, '$1').toLowerCase()
      : `${r[k]}` === v.replace(/^eq\./, ''));
    let rows = profiles.filter((r) => filters.every(([k, v]) => matches(r, k, v)));
    if (method === 'PATCH') rows.forEach((r) => Object.assign(r, JSON.parse(init.body)));
    rows = rows.map((r) => ({ ...r }));
    if (new Headers(init.headers).get('Accept') === 'application/vnd.pgrst.object+json') {
      return rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    }
    return json(200, rows);
  });
});

/* ---------- delete and restore ---------- */

test('delete: the account is switched off at once and can be restored for 30 days', async () => {
  const res = await request(app).delete(`/v1/profiles/${users.botanist}`).set(as('admin'));
  assert.equal(res.status, 200);
  const ben = profiles.find((p) => p.id === users.botanist);
  assert.equal(ben.is_active, false);
  assert.ok(ben.deleted_at);
  assert.equal(ben.deleted_by, users.admin);
  const days = (new Date(res.body.remove_at) - new Date(ben.deleted_at)) / 86400000;
  assert.equal(Math.round(days), 30);
});

test('restore: the delete is undone, and the account stays off until turned on', async () => {
  await request(app).delete(`/v1/profiles/${users.botanist}`).set(as('admin'));
  const res = await request(app).post(`/v1/profiles/${users.botanist}/restore`).set(as('admin'));
  assert.equal(res.status, 200);
  const ben = profiles.find((p) => p.id === users.botanist);
  assert.equal(ben.deleted_at, null);
  assert.equal(ben.is_active, false);
});

test('a deleted account cannot be turned on without restoring it first', async () => {
  await request(app).delete(`/v1/profiles/${users.botanist}`).set(as('admin'));
  const res = await request(app).patch(`/v1/profiles/${users.botanist}`).set(as('admin')).send({ is_active: true });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'USER_DELETED');
});

test('you cannot delete yourself, but another admin can while two are active', async () => {
  const self = await request(app).delete(`/v1/profiles/${users.admin}`).set(as('admin'));
  assert.equal(self.status, 422);
  profiles.push({ id: users.admin2, role: 'admin', is_active: true, deleted_at: null });
  assert.equal((await request(app).delete(`/v1/profiles/${users.admin}`).set(as('admin2'))).status, 200);
});

test('the last active admin cannot be deleted', async () => {
  profiles.push({ id: users.admin2, role: 'admin', is_active: false, deleted_at: null });
  const other = crypto.randomUUID();
  profiles.push({ id: other, role: 'admin', is_active: true, deleted_at: null });
  profiles.find((p) => p.id === users.admin).is_active = false; // only "other" is active
  const res = await request(app).delete(`/v1/profiles/${other}`).set(as('admin'));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'LAST_ADMIN');
});

test('deleting twice, or restoring an account that is not deleted, answers 409', async () => {
  await request(app).delete(`/v1/profiles/${users.botanist}`).set(as('admin'));
  assert.equal((await request(app).delete(`/v1/profiles/${users.botanist}`).set(as('admin'))).body.code, 'ALREADY_DELETED');
  await request(app).post(`/v1/profiles/${users.botanist}/restore`).set(as('admin'));
  assert.equal((await request(app).post(`/v1/profiles/${users.botanist}/restore`).set(as('admin'))).body.code, 'NOT_DELETED');
});

test('only admins can delete or restore', async () => {
  assert.equal((await request(app).delete(`/v1/profiles/${users.admin}`).set(as('botanist'))).status, 403);
  assert.equal((await request(app).post(`/v1/profiles/${users.admin}/restore`).set(as('botanist'))).status, 403);
});

test('an admin opening the users list removes accounts past their 30 days (at most hourly)', async () => {
  await request(app).get('/v1/profiles').set(as('admin'));
  await request(app).get('/v1/profiles').set(as('admin'));
  assert.equal(rpcCalls.filter((c) => c.name === 'purge_deleted_users').length, 1);
});

/* ---------- email limit ---------- */

test('invitation refused by the email limit: account made, admins notified with the wait', async () => {
  authAnswer.recover = RATE_LIMITED;
  const res = await request(app).post('/v1/profiles').set(as('admin'))
    .send({ email: 'newbotanist@gmail.com', full_name: 'New', role: 'botanist' });
  assert.equal(res.status, 201);
  assert.equal(res.body.invited, false);
  assert.equal(res.body.email_limit.limit, 2);
  assert.match(res.body.email_limit.message, /2\/2 per hour/);
  const call = rpcCalls.find((c) => c.name === 'notify_email_rate_limit');
  assert.equal(call.args.p_limit, 2);
  assert.equal(call.args.p_wait_minutes, 60, 'nothing on record: up to an hour');
  assert.match(call.args.p_what, /newbotanist@gmail.com/);
});

test('account creation refused by the email limit (confirm email on): 429 EMAIL_RATE_LIMIT', async () => {
  authAnswer.signup = RATE_LIMITED;
  const res = await request(app).post('/v1/profiles').set(as('admin'))
    .send({ email: 'newbotanist@gmail.com', full_name: 'New', role: 'botanist', password: 'longenough1' });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'EMAIL_RATE_LIMIT');
  assert.ok(rpcCalls.some((c) => c.name === 'notify_email_rate_limit'));
});

test('password reset over the limit says so and how long to wait', async () => {
  authAnswer.recover = RATE_LIMITED;
  const res = await request(app).post('/v1/auth/password-reset').send({ email: 'someone1@gmail.com' });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'EMAIL_RATE_LIMIT');
  assert.match(res.body.message, /Try again in up to 60 minutes/);
});

test('the wait counts from the oldest email of the last hour', () => {
  const now = Date.now();
  recordEmailSent(now - 50 * 60000);
  recordEmailSent(now - 5 * 60000);
  const info = emailLimitInfo(now);
  assert.equal(info.sent_last_hour, 2);
  assert.equal(info.wait_minutes, 10);
  assert.equal(info.estimated, false);
});

/* ---------- a failed creation sends no email ---------- */

const create = (fields = {}) => request(app).post('/v1/profiles').set(as('admin'))
  .send({ email: 'newbotanist@gmail.com', full_name: 'New', role: 'botanist', ...fields });

test('an address already in use is refused before Supabase is asked, so no email is sent', async () => {
  profiles.push({ id: crypto.randomUUID(), email: 'NewBotanist@Gmail.com', role: 'botanist', is_active: false, deleted_at: null });
  const res = await create();
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'EMAIL_TAKEN');
  assert.deepEqual(authCalls, []);
});

test('the address of a deleted account is refused, pointing to Restore', async () => {
  profiles.push({ id: crypto.randomUUID(), email: 'newbotanist@gmail.com', role: 'botanist', is_active: false, deleted_at: new Date().toISOString() });
  const res = await create();
  assert.equal(res.status, 409);
  assert.match(res.body.message, /Restore/);
  assert.deepEqual(authCalls, []);
});

test('a username in use is refused before Supabase is asked', async () => {
  profiles.push({ id: crypto.randomUUID(), email: 'other@gmail.com', username: 'jia', role: 'botanist', is_active: true, deleted_at: null });
  const res = await create({ username: 'JIA' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'USERNAME_TAKEN');
  assert.deepEqual(authCalls, []);
});

test("Supabase's hidden 'already registered' user: 409, and no invitation is sent", async () => {
  authAnswer.signup = () => json(200, { id: crypto.randomUUID(), email: 'newbotanist@gmail.com', identities: [] });
  const res = await create();
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'EMAIL_TAKEN');
  assert.deepEqual(authCalls, ['signup']);
  assert.equal(emailLimitInfo().sent_last_hour, 0, 'nothing counted for a failed attempt');
});

test('a profile that could not be saved gets no invitation', async () => {
  authAnswer.signup = () => json(200, { id: crypto.randomUUID(), email: 'newbotanist@gmail.com', identities: [{}] }); // no profile row appears
  const res = await create();
  assert.equal(res.status, 502);
  assert.equal(res.body.code, 'PROFILE_NOT_SAVED');
  assert.equal(authCalls.includes('recover'), false);
});

test('a successful invitation counts both emails it sent', async () => {
  const res = await create();
  assert.equal(res.status, 201);
  assert.equal(res.body.invited, true);
  assert.deepEqual(authCalls, ['signup', 'recover']);
  assert.equal(emailLimitInfo().sent_last_hour, 2);
});

/* ---------- invalid details say why ---------- */

test('1@gmail.com is refused with the reason, before Supabase is asked', async () => {
  const res = await create({ email: '1@gmail.com' });
  assert.equal(res.status, 422);
  assert.equal(res.body.details.fields[0].path, 'email');
  assert.match(res.body.details.fields[0].message, /Gmail addresses have 6 to 30 letters or numbers/);
  assert.deepEqual(authCalls, []);
});

test('a short temporary password says how many characters it needs', async () => {
  const res = await create({ password: 'abc' });
  assert.equal(res.status, 422);
  assert.match(res.body.details.fields[0].message, /at least 8 characters \(it has 3\)/);
});

test("Supabase refusing an address or a password is explained in plain words", async () => {
  authAnswer.signup = () => json(400, { code: 400, error_code: 'email_address_invalid', msg: 'Email address "abcdef@blocked.com" is invalid' });
  const bad = await create({ email: 'abcdef@blocked.com' });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.code, 'INVALID_EMAIL');
  assert.match(bad.body.message, /Check the spelling/);

  authAnswer.signup = () => json(422, { code: 422, error_code: 'weak_password', msg: 'Password is known to be weak', weak_password: { reasons: ['pwned'] } });
  const weak = await create({ password: 'password123' });
  assert.equal(weak.body.code, 'WEAK_PASSWORD');
  assert.match(weak.body.message, /data leak/);
});
