import multer from 'multer';
import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, UUID } from './validate.js';
import { detectImageType, stripMetadata, EXTENSIONS } from './images.js';
import { protectSpecimen } from './distribution.js';

// Field work: a botanist registers a plant on a QR tag (specimen), records
// observations of it, adds photos and comments, and sends records for review.
// Queries run as the signed-in user, so the RLS rules in the schema migration
// (own records for botanists, all for officer/admin) apply as a second check.
//
// Every create takes an optional client-made id. Sending the same id again (a
// retry after a dropped field connection) returns the row already saved with
// 200 instead of adding a second one.

const SPECIMEN_COLUMNS = `id, qr_id, species_id, proposed_species_name, registered_by, lat, lng,
  gps_accuracy_m, endangered_override, is_deleted, created_at, updated_at`;
const OBS_COLUMNS = `id, specimen_id, recorded_by, observed_at, height_cm, morphology, notes, lat, lng,
  gps_accuracy_m, status, version, device_id, last_synced_at, created_at, updated_at`;
const PHOTO_COLUMNS = 'id, observation_id, s3_bucket, s3_key, content_type, size_bytes, upload_status, caption, traits, created_at';
const COMMENT_COLUMNS = 'id, observation_id, author_id, body, created_at';

const PHOTO_BUCKET = 'observation-photos';
const MAX_BYTES = 10 * 1024 * 1024; // the bucket's file_size_limit
const SIGNED_FOR = 60 * 60 * 24; // the apps reload well within a day

const id = z.string().regex(UUID, 'must be a UUID');
const text = (max) => z.string().trim().max(max).transform((s) => s || null).nullable().optional();
const coord = (lim) => z.number().min(-lim).max(lim).nullable().optional();
const measure = { height_cm: z.number().min(0).max(100000).nullable().optional(), morphology: text(5000), notes: text(5000) };

const SpecimenCreate = z.strictObject({
  id: id.optional(),
  qr_id: z.string().trim().min(1).max(50),
  proposed_species_name: text(200),
  lat: coord(90),
  lng: coord(180),
  gps_accuracy_m: z.number().min(0).nullable().optional(),
});
const SpecimenUpdate = z.strictObject({
  species_id: id.nullable().optional(),
  proposed_species_name: text(200),
  endangered_override: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, 'Send at least one field to change');

const ObservationCreate = z.strictObject({
  id: id.optional(),
  specimen_id: id,
  observed_at: z.iso.datetime({ offset: true }).optional(),
  ...measure,
  lat: coord(90),
  lng: coord(180),
  gps_accuracy_m: z.number().min(0).nullable().optional(),
  // The insert policy allows only these; "synced" means sent for review.
  status: z.enum(['draft', 'queued', 'synced']).default('synced'),
  device_id: z.string().trim().max(100).optional(),
});
// Send for review: a draft or queued record as it is, or a returned record with
// the botanist's fixes and an optional reply to the officer.
const Submit = z.strictObject({ ...measure, comment: text(2000) });
const CommentCreate = z.strictObject({ body: z.string().trim().min(1).max(2000) });
// Same list as PHOTO_TRAITS in apps/shared/data.js.
const PhotoNotes = z.strictObject({
  caption: text(200),
  traits: z.array(z.enum(['Whole plant', 'Tree trunk', 'Bark', 'Leaf', 'Flower', 'Fruit', 'Seed', 'Root'])).max(8),
});

const fail = (res, status, code, message) => res.status(status).json({ code, message });
const dbError = (res, error) => fail(res, 500, 'DB_ERROR', error.message);
const isDuplicate = (error, constraint) => error?.code === '23505' && error.message.includes(constraint);
const obsNotFound = (res) => fail(res, 404, 'NOT_FOUND', 'Observation not found');

// Botanists only ever see what they recorded (RLS says the same).
const visibleTo = (query, user) => (user.role === 'botanist' ? query.eq('recorded_by', user.id) : query);
const findObservation = (db, req) => visibleTo(
  db.from('observations').select(OBS_COLUMNS).eq('id', req.params.id).eq('is_deleted', false),
  req.user,
).maybeSingle();

// HEIC (iPhone camera) is recognised only so it can be refused with a clear message:
// stripMetadata cannot remove its location (CTIP-110). detectImageType covers the other three.
function photoType(buf) {
  const known = detectImageType(buf);
  if (known) return known;
  const brand = buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp' ? buf.toString('latin1', 8, 12) : '';
  return ['heic', 'heix', 'mif1', 'msf1'].includes(brand) ? 'image/heic' : null;
}

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } })
  .single('file');

export const fieldHandlers = {
  // The plant already on a tag, if any, with its observation ids: the app uses
  // it to tell "tag in use" from "my own plant whose first send failed".
  // Any botanist can list every tag, so an endangered plant's exact spot is
  // reduced here as in /distribution (CTIP-71), unless the caller registered it.
  'get /specimens/by-qr/:qrId': async (req, res) => {
    const db = supabaseAs(req.user);
    const { data, error } = await db
      .from('specimens')
      .select(`${SPECIMEN_COLUMNS}, observations (id)`)
      .eq('qr_id', req.params.qrId)
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'No plant on this tag');
    let status = null;
    if (data.species_id) {
      // undefined when RLS hides the species from this user: protectSpecimen fails closed.
      const species = await db.from('species').select('conservation_status').eq('id', data.species_id).maybeSingle();
      if (species.error) return dbError(res, species.error);
      status = species.data ? species.data.conservation_status ?? null : undefined;
    }
    res.json(protectSpecimen(data, { role: req.user.role, userId: req.user.id, status }));
  },

  // Register a plant on an unused tag. The database marks the tag assigned
  // (migration 20261028000000) and allows one plant per tag.
  'post /specimens': async (req, res) => {
    const body = parseBody(SpecimenCreate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const { data, error } = await db
      .from('specimens')
      .insert({ ...body, species_id: null, registered_by: req.user.id, endangered_override: false, is_deleted: false })
      .select(SPECIMEN_COLUMNS)
      .single();
    if (!error) return res.status(201).json(data);
    if (isDuplicate(error, 'specimens_pkey')) {
      const existing = await db.from('specimens').select(SPECIMEN_COLUMNS).eq('id', body.id).single();
      if (existing.error) return dbError(res, existing.error);
      return res.status(200).json(existing.data);
    }
    if (error.code === '23505') {
      return fail(res, 409, 'TAG_IN_USE', `Tag ${body.qr_id} is already on another plant. Pick or scan an unused tag.`);
    }
    if (error.code === '23503') {
      return fail(res, 422, 'TAG_NOT_FOUND', `Tag ${body.qr_id} is not in the tag list. Ask an officer to create it.`);
    }
    return dbError(res, error);
  },

  // Match the plant to a species, or change what the botanist proposed.
  'patch /specimens/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Plant not found');
    const body = parseBody(SpecimenUpdate, req, res);
    if (!body) return;
    const { data, error } = await supabaseAs(req.user)
      .from('specimens')
      .update(body)
      .eq('id', req.params.id)
      .select(SPECIMEN_COLUMNS)
      .maybeSingle();
    if (error?.code === '23503') return fail(res, 422, 'VALIDATION_ERROR', 'That species does not exist');
    if (error) return dbError(res, error);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Plant not found');
    res.json(data);
  },

  // A new observation of a plant: the first one after registering, or a revisit.
  'post /observations': async (req, res) => {
    const body = parseBody(ObservationCreate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    // A botanist cannot add to a plant while an officer is still deciding on it. A retry
    // of the record that is waiting carries on below and gets that record back.
    if (req.user.role === 'botanist') {
      let waiting = db.from('observations').select('id').eq('specimen_id', body.specimen_id).eq('status', 'synced').eq('is_deleted', false);
      if (body.id) waiting = waiting.neq('id', body.id);
      const { data: open, error: openError } = await waiting.limit(1);
      if (openError) return dbError(res, openError);
      if (open.length) return fail(res, 409, 'REVIEW_IN_PROGRESS', 'This plant has a record waiting for an officer. You can add to it once a decision is returned.');
    }
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('observations')
      .insert({
        ...body,
        observed_at: body.observed_at ?? now,
        recorded_by: req.user.id,
        version: 1,
        last_synced_at: body.status === 'synced' ? now : null,
      })
      .select(OBS_COLUMNS)
      .single();
    if (!error) return res.status(201).json(data);
    if (isDuplicate(error, 'observations_pkey')) {
      const existing = await findObservation(db, { ...req, params: { id: body.id } });
      if (existing.error) return dbError(res, existing.error);
      if (existing.data) return res.status(200).json(existing.data);
    }
    if (error.code === '23503') return fail(res, 422, 'VALIDATION_ERROR', 'That plant does not exist');
    if (error.code === '42501') return fail(res, 403, 'FORBIDDEN', 'You cannot add an observation here');
    return dbError(res, error);
  },

  // Send for review. Draft/queued: as it is. Returned: with the fixes, and the
  // version goes up so the officer reviews the new one. The update only matches
  // while the status and version are still what was read, so a stale screen
  // cannot overwrite a record someone decided in the meantime.
  'post /observations/:id/submit': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const body = parseBody(Submit, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const current = await findObservation(db, req);
    if (current.error) return dbError(res, current.error);
    if (!current.data) return obsNotFound(res);
    const obs = current.data;

    const { comment, ...edits } = body;
    let changes;
    if (obs.status === 'draft' || obs.status === 'queued') changes = { status: 'synced' };
    else if (obs.status === 'returned') changes = { ...edits, status: 'synced', version: obs.version + 1 };
    else return fail(res, 409, 'WRONG_STATUS', 'This record is not a draft or waiting for your changes. Refresh to see its status.');

    const { data, error } = await db
      .from('observations')
      .update({ ...changes, last_synced_at: new Date().toISOString() })
      .eq('id', obs.id)
      .eq('status', obs.status)
      .eq('version', obs.version)
      .select(OBS_COLUMNS)
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return fail(res, 409, 'WRONG_STATUS', 'This record changed while you were sending it. Refresh to see its status.');

    if (comment && obs.status === 'returned') {
      const reply = await db.from('observation_comments').insert({ observation_id: obs.id, author_id: req.user.id, body: comment });
      // The record itself was sent; a lost reply should not undo that.
      if (reply.error) console.warn('resubmit reply not saved:', reply.error.message);
    }
    res.json(data);
  },

  'get /observations/:id/photos': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const db = supabaseAs(req.user);
    const obs = await findObservation(db, req);
    if (obs.error) return dbError(res, obs.error);
    if (!obs.data) return obsNotFound(res);
    const { data, error } = await db.from('observation_photos').select(PHOTO_COLUMNS)
      .eq('observation_id', req.params.id).order('created_at');
    if (error) return dbError(res, error);
    res.json(await withSignedUrls(db, data));
  },

  // multipart/form-data: file (the image), an optional id for the photo, an optional
  // caption, and traits (repeat the field for each part of the plant it shows).
  // The contract describes a signed-upload-URL flow; uploading through the API
  // instead lets it check the real file type and size, like species photos
  // (CTIP-85). Path convention: observation-photos/{observation_id}/{photo_id}.ext
  'post /observations/:id/photos': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    try {
      await new Promise((resolve, reject) => receive(req, res, (err) => (err ? reject(err) : resolve())));
    } catch (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'FILE_TOO_LARGE', 'Photos can be at most 10 MB');
      return fail(res, 422, 'VALIDATION_ERROR', 'Send one image in a form field called "file"');
    }
    if (!req.file) return fail(res, 422, 'VALIDATION_ERROR', 'Send one image in a form field called "file"');
    const type = photoType(req.file.buffer);
    if (!type || type === 'image/heic') {
      return fail(res, 415, 'UNSUPPORTED_FILE_TYPE', 'Photos must be JPEG, PNG or WebP. HEIC photos can carry their location, so they are not accepted.');
    }
    const photoId = req.body?.id ?? crypto.randomUUID();
    if (!UUID.test(photoId)) return fail(res, 422, 'VALIDATION_ERROR', 'id must be a UUID');
    const notes = PhotoNotes.safeParse({ caption: req.body?.caption, traits: [req.body?.traits ?? []].flat() });
    if (!notes.success) return fail(res, 422, 'VALIDATION_ERROR', 'caption can be at most 200 characters, and traits must come from the list');

    const db = supabaseAs(req.user);
    const obs = await findObservation(db, req);
    if (obs.error) return dbError(res, obs.error);
    if (!obs.data) return obsNotFound(res);

    const already = await db.from('observation_photos').select(PHOTO_COLUMNS).eq('id', photoId).maybeSingle();
    if (already.error) return dbError(res, already.error);
    if (already.data) return res.status(200).json((await withSignedUrls(db, [already.data]))[0]);

    const key = `${obs.data.id}/${photoId}.${EXTENSIONS[type]}`;
    // upsert: a retry after the file landed but the record did not writes the same path again.
    const cleanBuffer = stripMetadata(req.file.buffer, type);
    const stored = await db.storage.from(PHOTO_BUCKET).upload(key, cleanBuffer, { contentType: type, upsert: true });
    if (stored.error) return fail(res, 502, 'STORAGE_ERROR', stored.error.message);

    const { data, error } = await db
      .from('observation_photos')
      .insert({
        id: photoId, observation_id: obs.data.id, s3_bucket: PHOTO_BUCKET, s3_key: key,
        content_type: type, size_bytes: cleanBuffer.length, upload_status: 'uploaded',
        caption: notes.data.caption ?? null, traits: notes.data.traits,
      })
      .select(PHOTO_COLUMNS)
      .single();
    if (error) {
      await db.storage.from(PHOTO_BUCKET).remove([key]); // no record, so do not keep the file
      return dbError(res, error);
    }
    res.status(201).json((await withSignedUrls(db, [data]))[0]);
  },

  'get /observations/:id/comments': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const db = supabaseAs(req.user);
    const obs = await findObservation(db, req);
    if (obs.error) return dbError(res, obs.error);
    if (!obs.data) return obsNotFound(res);
    const { data, error } = await db.from('observation_comments').select(COMMENT_COLUMNS)
      .eq('observation_id', req.params.id).order('created_at');
    if (error) return dbError(res, error);
    res.json(data);
  },

  'post /observations/:id/comments': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const body = parseBody(CommentCreate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const obs = await findObservation(db, req);
    if (obs.error) return dbError(res, obs.error);
    if (!obs.data) return obsNotFound(res);
    const { data, error } = await db
      .from('observation_comments')
      .insert({ observation_id: obs.data.id, author_id: req.user.id, body: body.body })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  },
};

// Field photos are private: each row gets a link that works for a day.
// Rows saved by older app builds may hold a full link instead of a Storage path.
export async function withSignedUrls(db, rows) {
  const paths = rows.map((r) => r.s3_key).filter((k) => k && !/^[a-z]+:/i.test(k));
  const signed = new Map();
  if (paths.length) {
    const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_FOR);
    if (error) console.warn('observation photo links not signed:', error.message);
    for (const item of data ?? []) if (item?.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return rows.map((r) => ({ ...r, url: signed.get(r.s3_key) ?? (/^https?:/i.test(r.s3_key) ? r.s3_key : null) }));
}
