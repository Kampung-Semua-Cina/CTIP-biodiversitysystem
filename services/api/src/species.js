import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, fail, dbError, validationError, UUID } from './validate.js';

// Staff species endpoints (CTIP-46). Only Officer and Admin reach these:
// permissions.js and the RBAC middleware enforce that, and Supabase RLS
// ("species: staff write") checks it again because queries run as the user.

const COLUMNS = `id, scientific_name, common_name, family, genus, description, conservation_status,
  cultural_significance, is_published, is_deleted, created_by, updated_by, created_at, updated_at`;

// IUCN Red List categories (CTIP-46), stored lower case as the apps show them.
// Same list as CONSERVATION in apps/shared/data.js. Any case is accepted.
export const IUCN_STATUSES = ['least concern', 'near threatened', 'vulnerable', 'endangered',
  'critically endangered', 'extinct in the wild', 'extinct', 'data deficient', 'not evaluated'];

const text = (max) => z.string().trim().min(1).max(max);
const fields = {
  scientific_name: text(200),
  common_name: text(200).nullable(),
  family: text(100).nullable(),
  genus: text(100).nullable(),
  description: text(5000).nullable(),
  conservation_status: z.string().trim().toLowerCase().pipe(z.enum(IUCN_STATUSES)).nullable(),
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

// Search terms (CTIP-87). Only letters, digits, spaces and . ' - × are
// allowed, so a term can never carry PostgREST syntax (, ( ) ") or LIKE
// wildcards (% _ *) into the query.
const term = z.string().trim().min(1).max(100)
  .regex(/^[\p{L}\p{N} .'\-×]+$/u, "use only letters, numbers, spaces and . ' -");
const SpeciesSearch = z.object({
  q: term.optional(),
  family: term.optional(),
  conservation_status: term.optional(),
  created_from: z.iso.date().optional(),
  created_to: z.iso.date().optional(),
});

const ListQuery = SpeciesSearch.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  is_published: z.enum(['true', 'false']).optional(),
});

// GET /public/species (CTIP-26). Paging is opt-in: the web catalogue asks for
// everything, the phone asks a page at a time. Sending only `page` means 20 a page.
export const PublicListQuery = SpeciesSearch.extend({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Shared by GET /species and GET /public/species. Names match partially and
// ignore case; family and status match the whole value, ignoring case.
// Dates are the day the record was added (UTC), both ends inclusive.
export function applySearch(query, { q, family, conservation_status, created_from, created_to }) {
  if (q) query = query.or(`scientific_name.ilike."*${q}*",common_name.ilike."*${q}*"`);
  if (family) query = query.ilike('family', family);
  if (conservation_status) query = query.ilike('conservation_status', conservation_status);
  if (created_from) query = query.gte('created_at', `${created_from}T00:00:00Z`);
  if (created_to) query = query.lte('created_at', `${created_to}T23:59:59.999Z`);
  return query;
}

const badQuery = (res, error) => validationError(res, error, 'Bad search or paging parameters');

// For handlers outside this file: the parsed filters, or null after a 422.
export function parseSearch(req, res) {
  const result = SpeciesSearch.safeParse(req.query);
  if (!result.success) badQuery(res, result.error);
  return result.success ? result.data : null;
}

// Same for GET /public/species: filters plus optional page and limit, or null after a 422.
export function parsePublicList(req, res) {
  const result = PublicListQuery.safeParse(req.query);
  if (!result.success) badQuery(res, result.error);
  return result.success ? result.data : null;
}

const notFound = (res) => fail(res, 404, 'NOT_FOUND', 'Species not found');
const isDuplicate = (error, constraint) => error.code === '23505' && error.message.includes(constraint);
const duplicateName = (res) => fail(res, 409, 'DUPLICATE_SPECIES', 'A species with this scientific name already exists');

export const speciesHandlers = {
  'get /species': async (req, res) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) return badQuery(res, query.error);
    const { page, limit, is_published, ...filters } = query.data;
    let q = supabaseAs(req.user)
      .from('species')
      .select(COLUMNS, { count: 'exact' })
      .eq('is_deleted', false);
    if (is_published) q = q.eq('is_published', is_published === 'true');
    q = applySearch(q, filters);
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
