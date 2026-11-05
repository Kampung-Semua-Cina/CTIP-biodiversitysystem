import multer from 'multer';
import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, fail, dbError, validationError, UUID } from './validate.js';
import { detectImageType, stripMetadata, EXTENSIONS, receiveFile } from './images.js';
import { protectSpecimen } from './distribution.js';
import { OBS_COLUMNS, findObservation } from './observationAccess.js';
import { isFullLink, isWebLink } from './photoLinks.js';

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

const SpecimenList = z.object({
  species_id: id.optional(),
  unresolved: z.enum(['true', 'false']).optional(), // true: no species linked yet
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
// Editing a draft: the version the app last saw, and at least one field.
const ObservationUpdate = z.strictObject({
  version: z.number().int().min(1),
  ...measure,
  lat: coord(90),
  lng: coord(180),
  gps_accuracy_m: z.number().min(0).nullable().optional(),
}).refine((b) => Object.keys(b).length > 1, 'Send at least one field to change');
const ObservationDelete = z.object({ version: z.coerce.number().int().min(1).optional() });
// Records the botanist still holds: not sent yet (queued = waiting on the phone).
const EDITABLE = ['draft', 'queued'];

const isDuplicate = (error, constraint) => error?.code === '23505' && error.message.includes(constraint);
const obsNotFound = (res) => fail(res, 404, 'NOT_FOUND', 'Observation not found');
const plantNotFound = (res) => fail(res, 404, 'NOT_FOUND', 'Plant not found');
const photoNotFound = (res) => fail(res, 404, 'NOT_FOUND', 'Photo not found');
const changedMeanwhile = (res) =>
  fail(res, 409, 'VERSION_CONFLICT', 'This record changed since you opened it. Refresh and try again.');

// Plants with an endangered plant's exact spot reduced for this user, as in
// GET /workspace (CTIP-71). A species the user cannot read counts as unknown,
// so protectSpecimen() fails closed. Returns { data } or { error }.
async function protectSpecimens(db, user, specimens) {
  const speciesIds = [...new Set(specimens.map((s) => s.species_id).filter(Boolean))];
  const statusOf = new Map();
  if (speciesIds.length) {
    const { data, error } = await db.from('species').select('id, conservation_status').in('id', speciesIds);
    if (error) return { error };
    for (const s of data) statusOf.set(s.id, s.conservation_status ?? null);
  }
  return {
    data: specimens.map((s) => protectSpecimen(s, {
      role: user.role,
      userId: user.id,
      status: s.species_id ? statusOf.get(s.species_id) : null,
    })),
  };
}

// The observation named in the URL, or null after answering 500 or 404.
async function observationOr404(db, req, res) {
  const { data, error } = await findObservation(db, req);
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!data) {
    obsNotFound(res);
    return null;
  }
  return data;
}

// The caller's own draft named in the URL (and at `version`, when given), or
// null after answering. Another botanist's record is 404, as everywhere; an
// officer or admin gets 403, because they change records through the review.
async function ownDraftOrError(db, req, res, version) {
  const obs = await observationOr404(db, req, res);
  if (!obs) return null;
  if (obs.recorded_by !== req.user.id) {
    fail(res, 403, 'FORBIDDEN', 'Only the botanist who recorded this can change it. Officers use the review instead.');
    return null;
  }
  if (!EDITABLE.includes(obs.status)) {
    fail(res, 409, 'WRONG_STATUS', 'Only a record that has not been sent can be changed or deleted. Refresh to see its status.');
    return null;
  }
  if (version !== undefined && version !== obs.version) {
    changedMeanwhile(res);
    return null;
  }
  return obs;
}

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
    const shown = await protectSpecimens(db, req.user, [data]);
    if (shown.error) return dbError(res, shown.error);
    res.json(shown.data[0]);
  },

  // Plants as RLS allows (every signed-in user may read them), newest first,
  // with endangered spots reduced as in GET /workspace (CTIP-108). Deleted
  // plants are left out. Filters: species_id, unresolved (no species yet).
  'get /specimens': async (req, res) => {
    const query = SpecimenList.safeParse(req.query);
    if (!query.success) return validationError(res, query.error, 'Bad species_id, unresolved, page or limit');
    const { species_id, unresolved, page, limit } = query.data;
    const db = supabaseAs(req.user);
    let q = db.from('specimens').select(SPECIMEN_COLUMNS, { count: 'exact' }).eq('is_deleted', false);
    if (species_id) q = q.eq('species_id', species_id);
    if (unresolved === 'true') q = q.is('species_id', null);
    if (unresolved === 'false') q = q.not('species_id', 'is', null);
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) return dbError(res, error);
    const shown = await protectSpecimens(db, req.user, data);
    if (shown.error) return dbError(res, shown.error);
    res.json({ data: shown.data, meta: { page, limit, total: count } });
  },

  'get /specimens/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return plantNotFound(res);
    const db = supabaseAs(req.user);
    const { data, error } = await db.from('specimens').select(SPECIMEN_COLUMNS)
      .eq('id', req.params.id).eq('is_deleted', false).maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return plantNotFound(res);
    const shown = await protectSpecimens(db, req.user, [data]);
    if (shown.error) return dbError(res, shown.error);
    res.json(shown.data[0]);
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
    const obs = await observationOr404(db, req, res);
    if (!obs) return;

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

  // A botanist edits their own record before sending it (CTIP-108). The update
  // only matches while the status and version are still what was read, and it
  // moves the version on, so two phones editing one draft cannot overwrite
  // each other: the second gets 409 VERSION_CONFLICT.
  'patch /observations/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const body = parseBody(ObservationUpdate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const obs = await ownDraftOrError(db, req, res, body.version);
    if (!obs) return;
    const { version, ...changes } = body;
    const { data, error } = await db
      .from('observations')
      .update({ ...changes, version: version + 1 })
      .eq('id', obs.id)
      .eq('status', obs.status)
      .eq('version', version)
      .select(OBS_COLUMNS)
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return changedMeanwhile(res);
    res.json(data);
  },

  // Soft delete of the botanist's own unsent record: it stays for the audit
  // log but leaves every list. ?version= is checked when sent.
  'delete /observations/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const query = ObservationDelete.safeParse(req.query);
    if (!query.success) return validationError(res, query.error, 'version must be a whole number');
    const db = supabaseAs(req.user);
    const obs = await ownDraftOrError(db, req, res, query.data.version);
    if (!obs) return;
    const { data, error } = await db
      .from('observations')
      .update({ is_deleted: true })
      .eq('id', obs.id)
      .eq('status', obs.status)
      .eq('version', obs.version)
      .select('id')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return changedMeanwhile(res);
    res.status(204).end();
  },

  'get /observations/:id/photos': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const db = supabaseAs(req.user);
    const obs = await observationOr404(db, req, res);
    if (!obs) return;
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
    if (!(await receiveFile(receive, req, res))) return;
    const type = photoType(req.file.buffer);
    if (!type || type === 'image/heic') {
      return fail(res, 415, 'UNSUPPORTED_FILE_TYPE', 'Photos must be JPEG, PNG or WebP. HEIC photos can carry their location, so they are not accepted.');
    }
    const photoId = req.body?.id ?? crypto.randomUUID();
    if (!UUID.test(photoId)) return fail(res, 422, 'VALIDATION_ERROR', 'id must be a UUID');
    const notes = PhotoNotes.safeParse({ caption: req.body?.caption, traits: [req.body?.traits ?? []].flat() });
    if (!notes.success) return fail(res, 422, 'VALIDATION_ERROR', 'caption can be at most 200 characters, and traits must come from the list');

    const db = supabaseAs(req.user);
    const obs = await observationOr404(db, req, res);
    if (!obs) return;

    const already = await db.from('observation_photos').select(PHOTO_COLUMNS).eq('id', photoId).maybeSingle();
    if (already.error) return dbError(res, already.error);
    if (already.data) return res.status(200).json((await withSignedUrls(db, [already.data]))[0]);

    const key = `${obs.id}/${photoId}.${EXTENSIONS[type]}`;
    // upsert: a retry after the file landed but the record did not writes the same path again.
    const cleanBuffer = stripMetadata(req.file.buffer, type);
    const stored = await db.storage.from(PHOTO_BUCKET).upload(key, cleanBuffer, { contentType: type, upsert: true });
    if (stored.error) return fail(res, 502, 'STORAGE_ERROR', stored.error.message);

    const { data, error } = await db
      .from('observation_photos')
      .insert({
        id: photoId, observation_id: obs.id, s3_bucket: PHOTO_BUCKET, s3_key: key,
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

  // Marks a photo uploaded once its file is in Storage (CTIP-108). Photos sent
  // through POST /observations/:id/photos are saved as uploaded already, so for
  // those this just returns the photo; it is for a pending or failed row whose
  // file went to Storage by another way. Owner or staff (RLS "photos: update").
  'post /observations/:id/photos/:photoId/confirm': async (req, res) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.photoId)) return photoNotFound(res);
    const db = supabaseAs(req.user);
    const obs = await observationOr404(db, req, res);
    if (!obs) return;
    const { data: photo, error } = await db.from('observation_photos').select(PHOTO_COLUMNS)
      .eq('id', req.params.photoId).eq('observation_id', obs.id).maybeSingle();
    if (error) return dbError(res, error);
    if (!photo) return photoNotFound(res);
    if (photo.upload_status === 'uploaded') return res.json((await withSignedUrls(db, [photo]))[0]);

    // A full link (older builds) has no file of ours to look for.
    if (!isFullLink(photo.s3_key)) {
      const file = await db.storage.from(photo.s3_bucket || PHOTO_BUCKET).createSignedUrl(photo.s3_key, 60);
      if (file.error) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'The photo file has not arrived yet. Upload it, then confirm again.');
    }
    const updated = await db.from('observation_photos').update({ upload_status: 'uploaded' })
      .eq('id', photo.id).select(PHOTO_COLUMNS).maybeSingle();
    if (updated.error) return dbError(res, updated.error);
    if (!updated.data) return fail(res, 403, 'FORBIDDEN', 'You cannot change this photo');
    res.json((await withSignedUrls(db, [updated.data]))[0]);
  },

  'get /observations/:id/comments': async (req, res) => {
    if (!UUID.test(req.params.id)) return obsNotFound(res);
    const db = supabaseAs(req.user);
    const obs = await observationOr404(db, req, res);
    if (!obs) return;
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
    const obs = await observationOr404(db, req, res);
    if (!obs) return;
    const { data, error } = await db
      .from('observation_comments')
      .insert({ observation_id: obs.id, author_id: req.user.id, body: body.body })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  },
};

// Field photos are private: each row gets a link that works for a day.
// Rows saved by older app builds may hold a full link instead of a Storage path.
export async function withSignedUrls(db, rows) {
  const paths = rows.map((r) => r.s3_key).filter((k) => k && !isFullLink(k));
  const signed = new Map();
  if (paths.length) {
    const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_FOR);
    if (error) console.warn('observation photo links not signed:', error.message);
    for (const item of data ?? []) if (item?.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return rows.map((r) => ({ ...r, url: signed.get(r.s3_key) ?? (isWebLink(r.s3_key) ? r.s3_key : null) }));
}
