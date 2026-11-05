import multer from 'multer';
import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, fail, dbError, UUID } from './validate.js';
import { detectImageType, stripMetadata, EXTENSIONS, receiveFile } from './images.js';
import { isFullLink } from './photoLinks.js';

// Species photo upload (CTIP-85). The file comes to the API, which checks its
// real type and size, removes location metadata, and stores it in Supabase
// Storage as the signed-in user, so the bucket's own rules (Officer/Admin
// upload, 10 MB, JPEG/PNG/WebP) apply as a second check.

const BUCKET = 'species-media';
export const MAX_BYTES = 10 * 1024 * 1024; // same as the bucket's file_size_limit

// One file, kept in memory (never written to the API's disk), at most 10 MB.
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 10 } })
  .single('file');

const MediaFields = z.strictObject({
  caption: z.string().trim().min(1).max(300).optional(),
  credit: z.string().trim().min(1).max(200).optional(),
  is_primary: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort_order: z.coerce.number().int().min(0).max(1000).optional(),
});

// Same fields as an upload, as JSON (so is_primary is a real boolean). At least one.
const MediaUpdate = z.strictObject({
  caption: z.string().trim().min(1).max(300).optional(),
  credit: z.string().trim().min(1).max(200).nullable().optional(),
  is_primary: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
}).refine((b) => Object.keys(b).length > 0, 'Send at least one field to change');

const mediaNotFound = (res) => fail(res, 404, 'NOT_FOUND', 'Photo not found');

export const speciesMediaHandlers = {
  // multipart/form-data: file (the image), caption, credit, is_primary, sort_order
  'post /species/:id/media': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Species not found');
    if (!(await receiveFile(receive, req, res))) return;
    const type = detectImageType(req.file.buffer);
    if (!type) return fail(res, 415, 'UNSUPPORTED_FILE_TYPE', 'Photos must be JPEG, PNG or WebP');
    const fields = parseBody(MediaFields, req, res);
    if (!fields) return;

    const db = supabaseAs(req.user);
    const species = await db.from('species').select('id').eq('id', req.params.id).eq('is_deleted', false).maybeSingle();
    if (species.error) return dbError(res, species.error);
    if (!species.data) return fail(res, 404, 'NOT_FOUND', 'Species not found');

    // Path convention from supabase/migrations/..._storage.sql: {species_id}/{media_id}.ext
    const id = crypto.randomUUID();
    const key = `${req.params.id}/${id}.${EXTENSIONS[type]}`;
    const stored = await db.storage.from(BUCKET)
      .upload(key, stripMetadata(req.file.buffer, type), { contentType: type, upsert: false });
    if (stored.error) return fail(res, 502, 'STORAGE_ERROR', stored.error.message);

    const { is_primary = false, sort_order = 0, ...text } = fields;
    const { data, error } = await db
      .from('species_media')
      .insert({ id, species_id: req.params.id, s3_bucket: BUCKET, s3_key: key, ...text, is_primary, sort_order, uploaded_by: req.user.id })
      .select('id, species_id, caption, credit, is_primary, sort_order, created_at')
      .single();
    if (error) {
      await db.storage.from(BUCKET).remove([key]); // no record, so do not keep the file
      return dbError(res, error);
    }
    if (is_primary) {
      // Only one cover photo per species.
      await db.from('species_media').update({ is_primary: false }).eq('species_id', req.params.id).neq('id', id);
    }
    res.status(201).json({ ...data, url: db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl });
  },

  // JSON: caption, credit, is_primary, sort_order. The file itself never changes;
  // a new picture is a new upload.
  'patch /species/:id/media/:mediaId': async (req, res) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.mediaId)) return mediaNotFound(res);
    const body = parseBody(MediaUpdate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const { data, error } = await db
      .from('species_media')
      .update(body)
      .eq('id', req.params.mediaId)
      .eq('species_id', req.params.id)
      .select('id, species_id, caption, credit, is_primary, sort_order, created_at')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return mediaNotFound(res);
    if (body.is_primary) {
      await db.from('species_media').update({ is_primary: false }).eq('species_id', req.params.id).neq('id', data.id);
    }
    res.json(data);
  },

  // Removes the record, then the file. A file left behind (Storage error) is
  // harmless: nothing points at it any more.
  'delete /species/:id/media/:mediaId': async (req, res) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.mediaId)) return mediaNotFound(res);
    const db = supabaseAs(req.user);
    const { data, error } = await db
      .from('species_media')
      .delete()
      .eq('id', req.params.mediaId)
      .eq('species_id', req.params.id)
      .select('s3_bucket, s3_key')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return mediaNotFound(res);
    // Older rows may hold a full link instead of a Storage path; there is no file of ours to remove.
    if (data.s3_bucket === BUCKET && !isFullLink(data.s3_key)) {
      const removed = await db.storage.from(BUCKET).remove([data.s3_key]);
      if (removed.error) console.warn('species photo file not removed:', data.s3_key, removed.error.message);
    }
    res.status(204).end();
  },
};
