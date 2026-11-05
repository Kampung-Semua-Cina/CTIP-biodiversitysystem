import { z } from 'zod';
import { supabaseAnon, supabaseAs, supabaseFresh } from './supabase.js';
import { parseBody, UUID } from './validate.js';
import { withSignedUrls } from './field.js';
import { protectSpecimen } from './distribution.js';
import { dbLoad } from './dbLoad.js';
import { emailProblem, passwordProblem, nameProblem, weakPasswordMessage } from './accountRules.js';
import { recordEmailSent, isEmailRateLimit, emailLimitInfo, emailLimitMessage } from './emailLimit.js';

// Everything else the apps used to do straight against Supabase: the start-up
// load, accounts, QR tags, publishing, alerts, sensor thresholds and
// notifications. Queries run as the signed-in user, so RLS still applies.

const fail = (res, status, code, message) => res.status(status).json({ code, message });
const dbError = (res, error) => fail(res, 500, 'DB_ERROR', error.message);
const ROLES = ['botanist', 'officer', 'admin'];

const publicMediaUrl = (db, m) =>
  (/^https?:/i.test(m.s3_key) ? m.s3_key : db.storage.from(m.s3_bucket || 'species-media').getPublicUrl(m.s3_key).data.publicUrl);

// The start-up load. Each list is what RLS lets this user see, the same rows
// the apps read before. Without plants, tags or observations the apps would
// show wrong tag states, so those fail the request; the rest come back empty
// with the table name in `unavailable`.
const WORKSPACE = {
  species: (db) => db.from('species').select('*').order('created_at'),
  species_media: (db) => db.from('species_media').select('*').order('sort_order'),
  qr_tags: (db) => db.from('qr_tags').select('*').order('qr_id'),
  specimens: (db) => db.from('specimens').select('*'), // deleted ones too: their tags stay taken
  observations: (db) => db.from('observations').select('*').eq('is_deleted', false).order('observed_at', { ascending: false }),
  observation_photos: (db) => db.from('observation_photos').select('*').order('created_at'),
  observation_reviews: (db) => db.from('observation_reviews').select('*').order('created_at', { ascending: false }),
  observation_comments: (db) => db.from('observation_comments').select('*').order('created_at'),
  alerts: (db) => db.from('alerts').select('*').order('created_at', { ascending: false }),
  alert_notes: (db) => db.from('alert_notes').select('*').order('created_at'),
  sensor_nodes: (db) => db.from('sensor_nodes').select('*').order('created_at'),
  notifications: (db) => db.from('notifications').select('*').order('created_at', { ascending: false }),
  audit_logs: (db) => db.from('audit_logs').select('*').order('changed_at', { ascending: false }),
  profiles: (db) => db.from('profiles').select('*'),
  zones: (db) => db.from('zones').select('*').order('id'),
  // Discussion board: only the threads this user can read (RLS), and the
  // people they can share with or mention (names and roles only).
  discussions: (db) => db.from('discussions').select('*').order('last_post_at', { ascending: false }),
  discussion_audience: (db) => db.from('discussion_audience').select('*'),
  discussion_posts: (db) => db.from('discussion_posts').select('*').order('created_at'),
  directory: (db) => db.rpc('discussion_directory'),
};
const CORE = ['qr_tags', 'specimens', 'observations'];

async function loadWorkspace(db, names) {
  const results = await Promise.all(names.map((n) => WORKSPACE[n](db)));
  const out = Object.fromEntries(Object.keys(WORKSPACE).map((n) => [n, []]));
  out.unavailable = [];
  for (const [i, n] of names.entries()) {
    if (results[i].error) {
      if (CORE.includes(n)) throw results[i].error;
      console.warn(`workspace: ${n} not loaded:`, results[i].error.message);
      out.unavailable.push(n);
    } else out[n] = results[i].data;
  }
  out.species_media = out.species_media.map((m) => ({ ...m, url: publicMediaUrl(db, m) }));
  return out;
}

const Me = z.strictObject({
  full_name: z.string().trim().min(1).max(200).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,20}$/, 'use 3-20 letters, numbers, dots or underscores').optional(),
  phone: z.string().trim().regex(/^(\+?[0-9 -]{7,15})?$/, 'not a valid phone number').optional(),
  avatar_url: z.string().max(3_000_000).nullable().optional(),
}).refine((b) => Object.keys(b).length > 0, 'Send at least one field to change');

const ProfileUpdate = z.strictObject({
  full_name: z.string().trim().min(1).max(200).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, 'Send at least one field to change');

// Each refusal says why (accountRules.js), e.g. "Gmail addresses have 6 to 30
// letters or numbers before the @" for 1@gmail.com, and Supabase is never
// asked about an address that cannot work.
const reasonOf = (check) => (value, ctx) => {
  const problem = check(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
};
const ProfileCreate = z.strictObject({
  email: z.string().trim().toLowerCase().superRefine(reasonOf(emailProblem)),
  // Left out: a random one is set and the person gets an email to choose their own.
  password: z.string().superRefine(reasonOf(passwordProblem)).optional(),
  full_name: z.string().superRefine(reasonOf(nameProblem)).transform((n) => n.trim()),
  role: z.enum(ROLES),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{3,20}$/).optional(),
});

const TagBatch = z.strictObject({
  count: z.number().int().min(1).max(500),
  batch_label: z.string().trim().min(1).max(100),
});
const Publish = z.strictObject({ is_published: z.boolean() });
const Assign = z.strictObject({ assigned_to: z.string().regex(UUID, 'must be a UUID').nullable() });
const Resolve = z.strictObject({ outcome: z.string().trim().max(2000) });
const Note = z.strictObject({ note: z.string().trim().min(1).max(2000) });
const Thresholds = z.strictObject({ thresholds: z.record(z.string(), z.number().nullable()) });

// Tag ids are NIAH-0001, NIAH-0002, ... Same rule as nextTagIds in apps/shared/selectors.js.
const tagIds = (existing, count) => {
  const start = Math.max(0, ...existing.map((t) => Number(t.qr_id.replace(/\D/g, '')) || 0)) + 1;
  return Array.from({ length: count }, (_, i) => `NIAH-${String(start + i).padStart(4, '0')}`);
};

// One alert update; 404 when RLS hides it or it does not exist.
async function updateAlert(req, res, changes) {
  if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
  const { data, error } = await supabaseAs(req.user).from('alerts').update(changes)
    .eq('id', req.params.id).select('*').maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
  res.json(data);
}

async function setSpecies(req, res, changes) {
  if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Species not found');
  const { data, error } = await supabaseAs(req.user).from('species')
    .update({ ...changes, updated_by: req.user.id })
    .eq('id', req.params.id).select('*').maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return fail(res, 404, 'NOT_FOUND', 'Species not found');
  res.json(data);
}

// ---- Change detection for live updates (migration 20261105000000_table_versions)
// Each write to a table bumps its counter in table_versions. The app sends back
// the cursor from its last load; only lists whose table moved since then are
// loaded again, so a poll when nothing changed is one tiny query.

const FULL_LOAD_EVERY_MS = 12 * 60 * 60 * 1000; // photo links last a day: re-sign well before
// Lists that have no table of their own, and the table that changes them.
const SOURCE = { directory: 'profiles' };
const sourceOf = (list) => SOURCE[list] ?? list;
// A change to one table can change what another list should show.
const ALSO_RELOAD = {
  species: ['specimens'], // a species' status decides how exact its plants' locations are
  specimens: ['species'], // ...so plants are always protected with fresh statuses
  discussions: ['discussion_audience', 'discussion_posts'],
  discussion_audience: ['discussions', 'discussion_posts'], // sharing decides who can see a thread
};

// For ilike: match the text exactly, with % and _ taken literally.
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const encodeCursor = (c) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(text) {
  try {
    const c = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    return c && typeof c.v === 'object' && c.v !== null && Number.isFinite(c.full) ? c : null;
  } catch {
    return null;
  }
}

// { table: version }, or null when the counters cannot be read (migration not
// pushed yet): then every load is a full one, as before.
async function readVersions(db) {
  const { data, error } = await db.from('table_versions').select('table_name, version');
  if (error || !Array.isArray(data)) return null;
  return Object.fromEntries(data.map((r) => [r.table_name, Number(r.version)]));
}

// Which lists to load, given the cursor the app sent. null means all of them.
function listsToLoad(versions, prev, user, now) {
  const usable = versions && prev && prev.u === user.id && prev.r === user.role && now - prev.full < FULL_LOAD_EVERY_MS;
  if (!usable) return null;
  const tables = new Set([...Object.keys(versions), ...Object.keys(prev.v)]);
  const moved = [...tables].filter((t) => (versions[t] ?? 0) !== (prev.v[t] ?? 0));
  return Object.keys(WORKSPACE).filter((list) =>
    moved.includes(sourceOf(list)) || moved.some((t) => ALSO_RELOAD[t]?.includes(list)));
}

// ---- Deleted users (migration 20261105120000_user_soft_delete)
export const DELETE_GRACE_DAYS = 30;

// Accounts deleted more than 30 days ago are removed for good. Runs at most
// once an hour per API, on an admin's request (the database function checks
// the role too). A daily database job does the same when pg_cron is on.
let lastPurge = 0;
async function purgeDeletedUsersSoon(db, now = Date.now()) {
  if (now - lastPurge < 60 * 60 * 1000) return;
  lastPurge = now;
  const { data, error } = await db.rpc('purge_deleted_users');
  if (error) console.warn('purge_deleted_users:', error.message);
  else if (data) console.log(`purge_deleted_users: removed ${data} account(s) deleted over ${DELETE_GRACE_DAYS} days ago`);
}
export const resetPurgeClock = () => { lastPurge = 0; };

// Supabase refused an email: tell every admin (in the bell) how long to wait.
// Never stops the request: before the migration the function does not exist.
async function reportEmailLimit(req, what) {
  const info = emailLimitInfo();
  if (req.user?.role === 'admin') {
    const { error } = await supabaseAs(req.user).rpc('notify_email_rate_limit', {
      p_limit: info.limit, p_wait_minutes: info.wait_minutes, p_what: what,
    });
    if (error) console.warn('notify_email_rate_limit:', error.message);
  }
  return info;
}

export const staffHandlers = {
  // The start-up load and every live-update poll. With ?cursor= from the last
  // answer it sends only what changed: { partial: true, <changed lists>,
  // cursor }, or { partial: true, unchanged: true, cursor } when nothing did.
  // poll_after_ms tells the app how long to wait before asking again.
  'get /workspace': async (req, res) => {
    const db = supabaseAs(req.user);
    try {
      const now = Date.now();
      // Read before loading, so a write in between shows up on the next poll.
      const versions = await readVersions(db);
      const prev = req.query.cursor ? decodeCursor(req.query.cursor) : null;
      const only = listsToLoad(versions, prev, req.user, now);
      const partial = only !== null;

      const cursorFor = (failed = []) => {
        const v = { ...(versions ?? {}) };
        // A list that failed is asked for again next time.
        for (const list of failed) v[sourceOf(list)] = partial ? (prev.v[sourceOf(list)] ?? -1) : -1;
        return encodeCursor({ v, full: partial ? prev.full : now, u: req.user.id, r: req.user.role });
      };

      if (partial && only.length === 0) {
        return res.json({ partial: true, unchanged: true, cursor: cursorFor(), poll_after_ms: dbLoad().poll_after_ms });
      }

      const names = only ?? Object.keys(WORKSPACE);
      const loaded = await loadWorkspace(db, names);
      if (names.includes('observation_photos')) loaded.observation_photos = await withSignedUrls(db, loaded.observation_photos);
      // RLS lets every signed-in user read every plant, so reduce endangered
      // spots here, as /distribution does (CTIP-71, threat T13).
      if (names.includes('specimens')) {
        const statusOf = new Map(loaded.species.map((s) => [s.id, s.conservation_status ?? null]));
        loaded.specimens = loaded.specimens.map((s) =>
          protectSpecimen(s, { role: req.user.role, userId: req.user.id, status: statusOf.get(s.species_id) }));
      }

      if (req.user.role === 'admin') await purgeDeletedUsersSoon(db);
      const out = partial
        ? { partial: true, ...Object.fromEntries(names.map((n) => [n, loaded[n]])), unavailable: loaded.unavailable }
        : { partial: false, ...loaded };
      res.json({ ...out, cursor: cursorFor(loaded.unavailable), poll_after_ms: dbLoad().poll_after_ms });
    } catch (error) {
      dbError(res, error);
    }
  },

  // Visitors: published species, their photos, and published plants (CTIP-33 / visitor catalogue).
  'get /public/workspace': async (req, res) => {
    try {
      const db = supabaseAnon();
      const out = await loadWorkspace(db, ['species', 'species_media']);
      const { data: pubPlants } = await db.rpc('public_plants');
      const { data: pubPhotos } = await db.rpc('public_observation_photos');
      if (pubPlants?.length) {
        const specimenMap = new Map();
        const obsList = [];
        for (const row of pubPlants) {
          if (!specimenMap.has(row.id)) {
            specimenMap.set(row.id, {
              id: row.id,
              qr_id: row.qr_id,
              species_id: row.species_id,
              lat: row.lat,
              lng: row.lng,
              gps_accuracy_m: row.gps_accuracy_m,
              endangered_override: row.endangered_override,
              is_deleted: row.is_deleted,
            });
          }
          if (row.observation_id) {
            obsList.push({
              id: row.observation_id,
              specimen_id: row.id,
              status: 'approved',
              height_cm: row.height_cm,
              morphology: row.morphology,
              observed_at: row.observed_at,
              is_deleted: false,
            });
          }
        }
        out.specimens = Array.from(specimenMap.values());
        out.observations = obsList;
      }
      if (pubPhotos?.length) {
        out.observation_photos = pubPhotos.map((p) => ({
          id: p.id,
          observation_id: p.observation_id,
          s3_key: p.s3_key,
          s3_bucket: p.s3_bucket,
          created_at: p.created_at,
          url: p.s3_key && !p.s3_key.startsWith('http')
            ? `${process.env.SUPABASE_URL}/storage/v1/object/public/${p.s3_bucket || 'observation-photos'}/${p.s3_key}`
            : p.s3_key,
        }));
      }
      res.json(out);
    } catch (error) {
      dbError(res, error);
    }
  },

  'patch /me': async (req, res) => {
    const body = parseBody(Me, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    if (body.username) {
      const taken = await db.from('profiles').select('id').ilike('username', body.username).neq('id', req.user.id).limit(1);
      if (taken.error) return dbError(res, taken.error);
      if (taken.data.length) return fail(res, 409, 'USERNAME_TAKEN', 'This username is already taken');
    }
    const { data, error } = await db.from('profiles').update(body).eq('id', req.user.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 403, 'FORBIDDEN', 'Your profile cannot be changed');
    res.json(data);
  },

  'get /profiles': async (req, res) => {
    await purgeDeletedUsersSoon(supabaseAs(req.user));
    const { data, error } = await supabaseAs(req.user).from('profiles').select('*').order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  // Admin creates an account. Supabase Auth makes the user (and the profile,
  // trigger handle_new_user); the admin's own session then sets the role.
  // Without a password it is an invitation: the person sets theirs from the email.
  //
  // Supabase sends an email as soon as it creates the account ("Confirm email"
  // on), and the invitation is a second one; only 2 an hour are allowed. So
  // everything that can make this fail is checked before Supabase is asked,
  // and the invitation goes only once the account is fully saved. A failed
  // attempt then sends no email and uses none of the limit.
  'post /profiles': async (req, res) => {
    const body = parseBody(ProfileCreate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);

    // 1. Before any email: is the address or username already in use?
    //    Deleted and turned-off accounts count; they still hold the address.
    const sameEmail = await db.from('profiles').select('id, deleted_at').ilike('email', escapeLike(body.email)).limit(1);
    if (sameEmail.error) return dbError(res, sameEmail.error);
    if (sameEmail.data.length) {
      return fail(res, 409, 'EMAIL_TAKEN', sameEmail.data[0].deleted_at
        ? 'This email belongs to a deleted account. Restore it from Not active instead.'
        : 'This email already has an account');
    }
    if (body.username) {
      const sameName = await db.from('profiles').select('id').ilike('username', escapeLike(body.username)).limit(1);
      if (sameName.error) return dbError(res, sameName.error);
      if (sameName.data.length) return fail(res, 409, 'USERNAME_TAKEN', 'This username is already taken');
    }

    const auth = supabaseFresh().auth;
    const invite = !body.password;
    const { data: created, error: authError } = await auth.signUp({
      email: body.email,
      password: body.password ?? `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      options: { data: { full_name: body.full_name, role: body.role } },
    });
    if (authError) {
      if (authError.code === 'signup_disabled' || /signups not allowed/i.test(authError.message)) {
        return fail(res, 503, 'SIGNUP_DISABLED',
          "Sign-ups are turned off in Supabase. In the Supabase Dashboard, go to Authentication > Providers > Email and turn on 'Allow new users to sign up'.");
      }
      if (authError.code === 'user_already_exists' || /already registered/i.test(authError.message)) {
        return fail(res, 409, 'EMAIL_TAKEN', 'This email already has an account');
      }
      // Passed our checks but Supabase still refused it (e.g. a domain it blocks).
      if (authError.code === 'email_address_invalid' || /email address .* is invalid/i.test(authError.message)) {
        return fail(res, 422, 'INVALID_EMAIL', `Supabase refused ${body.email}: it does not accept this address. Check the spelling, or use another address.`);
      }
      if (authError.code === 'weak_password') {
        return fail(res, 422, 'WEAK_PASSWORD', weakPasswordMessage(authError.reasons));
      }
      // "Confirm email" is on, so creating the account sends an email, and the limit is reached.
      if (isEmailRateLimit(authError)) {
        const info = await reportEmailLimit(req, `The account for ${body.email}`);
        return res.status(429).json({ code: 'EMAIL_RATE_LIMIT', message: `${emailLimitMessage(info)} The account for ${body.email} was not created.`, details: info });
      }
      return fail(res, 422, 'VALIDATION_ERROR', authError.message);
    }
    const id = created.user?.id;
    if (!id) return fail(res, 502, 'AUTH_ERROR', 'Supabase did not return the new user');
    // 2. With "Confirm email" on, Supabase hides an address that already has a
    //    sign-in account: no error, a made-up user with no identities. (It may
    //    resend that person's confirmation email; nothing else is sent here.)
    if (Array.isArray(created.user.identities) && created.user.identities.length === 0) {
      return fail(res, 409, 'EMAIL_TAKEN', 'This email already has a sign-in account');
    }
    if (created.user.confirmation_sent_at) recordEmailSent(); // a real new account got its confirmation email

    const fields = { full_name: body.full_name, email: body.email, role: body.role, is_active: true };
    if (body.username) fields.username = body.username;
    const { data, error } = await db.from('profiles').update(fields).eq('id', id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    // 3. Not saved: say so, and send no invitation to an account that is not ready.
    if (!data) {
      return fail(res, 502, 'PROFILE_NOT_SAVED',
        `The sign-in account for ${body.email} was made, but its profile could not be saved. Find it under Not active or ask a developer; do not create it again.`);
    }
    let invited = false;
    let emailLimit;
    if (invite) {
      const sent = await auth.resetPasswordForEmail(body.email);
      if (sent.error) console.warn('invitation email not sent:', sent.error.message);
      if (!sent.error) recordEmailSent();
      if (isEmailRateLimit(sent.error)) {
        const info = await reportEmailLimit(req, `The invitation to ${body.email}`);
        emailLimit = { ...info, message: `${emailLimitMessage(info)} The account was created, but the invitation email was not sent.` };
      }
      invited = !sent.error;
    }
    res.status(201).json({ ...data, invited, ...(emailLimit ? { email_limit: emailLimit } : {}) });
  },

  'patch /profiles/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const body = parseBody(ProfileUpdate, req, res);
    if (!body) return;
    if (req.params.id === req.user.id && (body.role || body.is_active === false)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'You cannot change your own role or turn off your own account');
    }
    if (body.is_active === true) {
      const current = await supabaseAs(req.user).from('profiles').select('deleted_at').eq('id', req.params.id).maybeSingle();
      if (current.error) return dbError(res, current.error);
      if (current.data?.deleted_at) return fail(res, 409, 'USER_DELETED', 'This account is deleted. Restore it before turning it on.');
    }
    const { data, error } = await supabaseAs(req.user).from('profiles').update(body)
      .eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'User not found');
    res.json(data);
  },

  // Soft delete: switched off at once, removed for good after 30 days.
  'delete /profiles/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found');
    if (req.params.id === req.user.id) return fail(res, 422, 'VALIDATION_ERROR', 'You cannot delete your own account');
    const db = supabaseAs(req.user);
    const target = await db.from('profiles').select('id, role, is_active, deleted_at').eq('id', req.params.id).maybeSingle();
    if (target.error) return dbError(res, target.error);
    if (!target.data) return fail(res, 404, 'NOT_FOUND', 'User not found');
    if (target.data.deleted_at) return fail(res, 409, 'ALREADY_DELETED', 'This account is already deleted');
    if (target.data.role === 'admin' && target.data.is_active) {
      const admins = await db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
      if (admins.error) return dbError(res, admins.error);
      if (admins.data.length <= 1) return fail(res, 409, 'LAST_ADMIN', 'You cannot delete the last active admin');
    }
    const deletedAt = new Date();
    const { data, error } = await db.from('profiles')
      .update({ deleted_at: deletedAt.toISOString(), deleted_by: req.user.id, is_active: false })
      .eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const removeAt = new Date(deletedAt.getTime() + DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    res.json({ ...data, remove_at: removeAt.toISOString() });
  },

  // Undo a delete within the 30 days. The account stays switched off until an admin turns it on.
  'post /profiles/:id/restore': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const db = supabaseAs(req.user);
    const target = await db.from('profiles').select('id, deleted_at').eq('id', req.params.id).maybeSingle();
    if (target.error) return dbError(res, target.error);
    if (!target.data) return fail(res, 404, 'NOT_FOUND', 'User not found (it may have been removed for good)');
    if (!target.data.deleted_at) return fail(res, 409, 'NOT_DELETED', 'This account is not deleted');
    const { data, error } = await db.from('profiles').update({ deleted_at: null, deleted_by: null })
      .eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    res.json(data);
  },

  'get /qr-tags': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('qr_tags').select('*').order('qr_id');
    if (error) return dbError(res, error);
    res.json(data);
  },

  'get /qr-tags/:qrId': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('qr_tags').select('*').eq('qr_id', req.params.qrId).maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Tag not found');
    res.json(data);
  },

  // New ids follow the highest one in the database. Two officers printing at
  // the same moment can pick the same ids; the loser tries again with fresh ones.
  // A botanist with no printed tag to hand makes one for the plant in front of
  // them (CTIP-27); printing batches stays with officers and admins.
  'post /qr-tags/batch': async (req, res) => {
    const body = parseBody(TagBatch, req, res);
    if (!body) return;
    if (req.user.role === 'botanist' && body.count !== 1) {
      return fail(res, 403, 'FORBIDDEN', 'Botanists can create one tag at a time. Ask an officer to print a batch.');
    }
    const db = supabaseAs(req.user);
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await db.from('qr_tags').select('qr_id');
      if (existing.error) return dbError(res, existing.error);
      const rows = tagIds(existing.data, body.count)
        .map((qr_id) => ({ qr_id, status: 'unassigned', batch_label: body.batch_label, created_by: req.user.id }));
      const { data, error } = await db.from('qr_tags').insert(rows).select('*');
      if (!error) return res.status(201).json(data);
      if (error.code !== '23505') return dbError(res, error);
    }
    fail(res, 409, 'CONFLICT', 'Someone else is creating tags right now. Try again.');
  },

  // Only a tag that was never put on a plant can be deleted; others are retired.
  'delete /qr-tags/:qrId': async (req, res) => {
    const db = supabaseAs(req.user);
    const onPlant = await db.from('specimens').select('id').eq('qr_id', req.params.qrId).limit(1);
    if (onPlant.error) return dbError(res, onPlant.error);
    if (onPlant.data.length) return fail(res, 409, 'TAG_IN_USE', 'This tag is on a plant. Retire it instead.');
    const { data, error } = await db.from('qr_tags').delete().eq('qr_id', req.params.qrId).eq('status', 'unassigned')
      .select('qr_id').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'No unused tag with this id');
    res.status(204).end();
  },

  'post /qr-tags/:qrId/retire': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('qr_tags').update({ status: 'retired' })
      .eq('qr_id', req.params.qrId).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Tag not found');
    res.json(data);
  },

  'post /species/:id/publish': async (req, res) => {
    const body = parseBody(Publish, req, res);
    if (!body) return;
    await setSpecies(req, res, { is_published: body.is_published });
  },

  // Undo a soft delete (DELETE /species/:id).
  'post /species/:id/restore': (req, res) => setSpecies(req, res, { is_deleted: false }),

  'get /alerts': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('alerts').select('*').order('created_at', { ascending: false });
    if (error) return dbError(res, error);
    res.json(data);
  },

  'get /alerts/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
    const { data, error } = await supabaseAs(req.user).from('alerts').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
    res.json(data);
  },

  'post /alerts/:id/assign': async (req, res) => {
    const body = parseBody(Assign, req, res);
    if (!body) return;
    await updateAlert(req, res, { assigned_to: body.assigned_to });
  },

  'post /alerts/:id/acknowledge': (req, res) =>
    updateAlert(req, res, { status: 'acknowledged', acknowledged_by: req.user.id, acknowledged_at: new Date().toISOString() }),

  'post /alerts/:id/resolve': async (req, res) => {
    const body = parseBody(Resolve, req, res);
    if (!body) return;
    await updateAlert(req, res, { status: 'resolved', outcome: body.outcome, resolved_by: req.user.id, resolved_at: new Date().toISOString() });
  },

  'get /alerts/:id/notes': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
    const { data, error } = await supabaseAs(req.user).from('alert_notes').select('*').eq('alert_id', req.params.id).order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  'post /alerts/:id/notes': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Alert not found');
    const body = parseBody(Note, req, res);
    if (!body) return;
    const { data, error } = await supabaseAs(req.user).from('alert_notes')
      .insert({ alert_id: req.params.id, author_id: req.user.id, note: body.note }).select('*').single();
    if (error?.code === '23503') return fail(res, 404, 'NOT_FOUND', 'Alert not found');
    if (error) return dbError(res, error);
    res.status(201).json(data);
  },

  'get /sensor-nodes': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('sensor_nodes').select('*').order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  'patch /sensor-nodes/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Sensor node not found');
    const body = parseBody(Thresholds, req, res);
    if (!body) return;
    const { data, error } = await supabaseAs(req.user).from('sensor_nodes').update({ thresholds: body.thresholds })
      .eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Sensor node not found');
    res.json(data);
  },

  // The signed-in person's own notifications (RLS returns only those).
  'get /notifications': async (req, res) => {
    const { data, error } = await supabaseAs(req.user).from('notifications').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) return dbError(res, error);
    res.json(data);
  },

  'post /notifications/:id/read': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Notification not found');
    const { data, error } = await supabaseAs(req.user).from('notifications').update({ is_read: true })
      .eq('id', req.params.id).eq('user_id', req.user.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Notification not found');
    res.json(data);
  },

  'post /notifications/read-all': async (req, res) => {
    const { error } = await supabaseAs(req.user).from('notifications').update({ is_read: true })
      .eq('user_id', req.user.id).eq('is_read', false);
    if (error) return dbError(res, error);
    res.status(204).end();
  },
};
