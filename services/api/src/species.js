import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, UUID } from './validate.js';

// Staff species endpoints (CTIP-46). Only Officer and Admin reach these:
// permissions.js and the RBAC middleware enforce that, and Supabase RLS
// ("species: staff write") checks it again because queries run as the user.

const COLUMNS = `id, scientific_name, common_name, family, genus, description, conservation_status,
  cultural_significance, is_published, is_deleted, created_by, updated_by, created_at, updated_at`;

const text = (max) => z.string().trim().min(1).max(max);
const fields = {
  scientific_name: text(200),
  common_name: text(200).nullable(),
  family: text(100).nullable(),
  genus: text(100).nullable(),
  description: text(5000).nullable(),
  conservation_status: text(50).nullable(),
  cultural_significance: text(5000).nullable(),
};

// Strict: unknown keys such as is_published or created_by are rejected, so a
// client cannot set them through create or update.
const SpeciesCreate = z.strictObject({
  id: z.string().regex(UUID, 'must be a UUID').optional(),
  ...fields,
  common_name: fields.common_name.optional(),
  family: fields.family.optional(),
  genus: fields.genus.optional(),
  description: fields.description.optional(),
  conservation_status: fields.conservation_status.optional(),
  cultural_significance: fields.cultural_significance.optional(),
});
const SpeciesUpdate = z.strictObject(fields).partial()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change');

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  is_published: z.enum(['true', 'false']).optional(),
});

const notFound = (res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Species not found' });
const dbError = (res, error) => res.status(500).json({ code: 'DB_ERROR', message: error.message });
const isDuplicate = (error, constraint) => error.code === '23505' && error.message.includes(constraint);
const duplicateName = (res) =>
  res.status(409).json({ code: 'DUPLICATE_SPECIES', message: 'A species with this scientific name already exists' });

export const speciesHandlers = {
  'get /species': async (req, res) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Bad page, limit or is_published' });
    }
    const { page, limit, is_published } = query.data;
    let q = supabaseAs(req.user)
      .from('species')
      .select(COLUMNS, { count: 'exact' })
      .eq('is_deleted', false);
    if (is_published) q = q.eq('is_published', is_published === 'true');
    const { data, count, error } = await q
      .order('scientific_name')
      .range((page - 1) * limit, page * limit - 1);
    if (error) return dbError(res, error);
    res.json({ data, meta: { page, limit, total: count } });
  },

  // The client may send its own id. Sending the same id again (a retry after
  // a dropped connection) returns the record already saved, with 200.
  'post /species': async (req, res) => {
    const body = parseBody(SpeciesCreate, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const { data, error } = await db
      .from('species')
      .insert({ ...body, created_by: req.user.id, updated_by: req.user.id })
      .select(COLUMNS)
      .single();
    if (!error) return res.status(201).json(data);
    if (isDuplicate(error, 'species_pkey')) {
      const existing = await db.from('species').select(COLUMNS).eq('id', body.id).single();
      if (existing.error) return dbError(res, existing.error);
      return res.status(200).json(existing.data);
    }
    if (isDuplicate(error, 'scientific_name')) return duplicateName(res);
    return dbError(res, error);
  },

  'get /species/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const { data, error } = await supabaseAs(req.user)
      .from('species')
      .select(COLUMNS)
      .eq('id', req.params.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res);
    res.json(data);
  },

  'patch /species/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const body = parseBody(SpeciesUpdate, req, res);
    if (!body) return;
    const { data, error } = await supabaseAs(req.user)
      .from('species')
      .update({ ...body, updated_by: req.user.id })
      .eq('id', req.params.id)
      .eq('is_deleted', false)
      .select(COLUMNS)
      .maybeSingle();
    if (error && isDuplicate(error, 'scientific_name')) return duplicateName(res);
    if (error) return dbError(res, error);
    if (!data) return notFound(res);
    res.json(data);
  },

  // Soft delete: the row stays for the audit log and for observations that
  // point at it, but it disappears from every list and from visitors.
  'delete /species/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return notFound(res);
    const { data, error } = await supabaseAs(req.user)
      .from('species')
      .update({ is_deleted: true, updated_by: req.user.id })
      .eq('id', req.params.id)
      .eq('is_deleted', false)
      .select('id')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res);
    res.status(204).end();
  },
};
