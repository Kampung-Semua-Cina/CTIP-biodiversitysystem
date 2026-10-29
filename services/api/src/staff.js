import { z } from 'zod';
import { supabaseAnon, supabaseAs, supabaseFresh } from './supabase.js';
import { parseBody, UUID } from './validate.js';
import { withSignedUrls } from './field.js';

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

const ProfileCreate = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Left out: a random one is set and the person gets an email to choose their own.
  password: z.string().min(8).max(200).optional(),
  full_name: z.string().trim().min(1).max(200),
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

export const staffHandlers = {
  'get /workspace': async (req, res) => {
    const db = supabaseAs(req.user);
    try {
      const out = await loadWorkspace(db, Object.keys(WORKSPACE));
      out.observation_photos = await withSignedUrls(db, out.observation_photos);
      res.json(out);
    } catch (error) {
      dbError(res, error);
    }
  },

  // Visitors: published species and their photos only (RLS "public read").
  'get /public/workspace': async (req, res) => {
    try {
      res.json(await loadWorkspace(supabaseAnon(), ['species', 'species_media']));
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
    const { data, error } = await supabaseAs(req.user).from('profiles').select('*').order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  // Admin creates an account. Supabase Auth makes the user (and the profile,
  // trigger handle_new_user); the admin's own session then sets the role.
  // Without a password it is an invitation: the person sets theirs from the email.
  'post /profiles': async (req, res) => {
    const body = parseBody(ProfileCreate, req, res);
    if (!body) return;
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
      return fail(res, 422, 'VALIDATION_ERROR', authError.message);
    }
    const id = created.user?.id;
    if (!id) return fail(res, 502, 'AUTH_ERROR', 'Supabase did not return the new user');
    const fields = { full_name: body.full_name, email: body.email, role: body.role, is_active: true };
    if (body.username) fields.username = body.username;
    const { data, error } = await supabaseAs(req.user).from('profiles').update(fields).eq('id', id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    let invited = false;
    if (invite) {
      const sent = await auth.resetPasswordForEmail(body.email);
      if (sent.error) console.warn('invitation email not sent:', sent.error.message);
      invited = !sent.error;
    }
    res.status(201).json({ ...(data ?? { id, ...fields }), invited });
  },

  'patch /profiles/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const body = parseBody(ProfileUpdate, req, res);
    if (!body) return;
    if (req.params.id === req.user.id && (body.role || body.is_active === false)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'You cannot change your own role or turn off your own account');
    }
    const { data, error } = await supabaseAs(req.user).from('profiles').update(body)
      .eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'User not found');
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
