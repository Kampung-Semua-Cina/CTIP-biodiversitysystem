import { supabaseAnon, supabaseAs } from './supabase.js';
import { fail, dbError, UUID } from './validate.js';
import { speciesHandlers, applySearch, parsePublicList } from './species.js';
import { distributionHandlers } from './distribution.js';
import { speciesMediaHandlers } from './speciesMedia.js';
import { observationHandlers } from './observations.js';
import { fieldHandlers } from './field.js';
import { staffHandlers } from './staff.js';
import { sessionHandlers } from './session.js';
import { protectSpecimen } from './distribution.js';
import { tooMany } from './rateLimit.js';

// Public link for a species photo. Rows saved by older web builds may hold a
// full link instead of a Storage path.
const mediaUrl = (db, { s3_bucket, s3_key }) =>
  /^https?:/i.test(s3_key) ? s3_key : db.storage.from(s3_bucket).getPublicUrl(s3_key).data.publicUrl;

// The species' cover photo: the one marked primary, else the first by sort order.
export function coverUrl(db, media = []) {
  const cover = media.find((m) => m.is_primary) ?? [...media].sort((a, b) => a.sort_order - b.sort_order)[0];
  return cover ? mediaUrl(db, cover) : null;
}

// One published species with its gallery, visitor fields only (listed one by
// one so internal fields never reach a visitor). null when it is missing,
// unpublished or deleted.
async function loadPublicSpecies(db, id) {
  const { data: species, error } = await db
    .from('species')
    .select(`id, scientific_name, common_name, family, genus, description, conservation_status,
      cultural_significance, species_media (id, species_id, s3_bucket, s3_key, caption, credit,
      is_primary, sort_order, created_at)`)
    .eq('id', id)
    .eq('is_published', true)
    .eq('is_deleted', false)
    .order('sort_order', { referencedTable: 'species_media' })
    .maybeSingle();
  if (error) throw error;
  if (!species) return null;
  const { species_media, ...fields } = species;
  const media = species_media.map(({ s3_bucket, s3_key, ...m }) => ({ ...m, url: mediaUrl(db, { s3_bucket, s3_key }) }));
  return { ...fields, primary_image_url: coverUrl(db, species_media), media };
}

// Visitor tag lookups per caller address: enough for anyone walking the trail,
// too few to read every tag in turn (CTIP-33).
export const TAG_LOOKUP_LIMIT = 30;
export const TAG_LOOKUP_WINDOW_MS = 60 * 1000;
const QR_ID = /^[A-Z0-9-]{1,32}$/;

// Implemented endpoints, keyed "method path" to match permissions.js.
// Anything not listed here answers 501 until someone builds it.
export const handlers = {
  // Also the botanist's species lookup on mobile (CTIP-26, CTIP-87). Each row
  // carries one cover photo, not the gallery; GET /public/species/:id has that.
  'get /public/species': async (req, res) => {
    const query = parsePublicList(req, res);
    if (!query) return;
    const { page: askedPage, limit: askedLimit, ...filters } = query;
    const paged = askedPage !== undefined || askedLimit !== undefined;
    const db = supabaseAnon();
    let published = db
      .from('species')
      .select(`id, scientific_name, common_name, family, genus, description, conservation_status,
        species_media (s3_bucket, s3_key, is_primary, sort_order)`, { count: 'exact' })
      .eq('is_published', true)
      .eq('is_deleted', false);
    published = applySearch(published, filters).order('scientific_name');
    const page = askedPage ?? 1;
    const limit = askedLimit ?? 20;
    if (paged) published = published.range((page - 1) * limit, page * limit - 1);
    const { data, count, error } = await published;
    if (error) return dbError(res, error);

    // Fields listed one by one, so nothing internal can reach a visitor.
    const rows = data.map((s) => ({
      id: s.id,
      scientific_name: s.scientific_name,
      common_name: s.common_name ?? null,
      family: s.family ?? null,
      genus: s.genus ?? null,
      description: s.description ?? null,
      conservation_status: s.conservation_status ?? null,
      primary_image_url: coverUrl(db, s.species_media ?? []),
    }));
    const total = count ?? rows.length;
    res.json({ data: rows, meta: paged ? { page, limit, total } : { page: 1, limit: total, total } });
  },

  // A species page for visitors. Nothing here joins specimens, so no
  // coordinates can leak. RLS hides unpublished species as a second guard.
  'get /public/species/:id': async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'Species not found');
    try {
      const species = await loadPublicSpecies(supabaseAnon(), req.params.id);
      if (!species) return fail(res, 404, 'NOT_FOUND', 'Species not found');
      res.json(species);
    } catch (error) {
      dbError(res, error);
    }
  },

  // Visitor QR page (CTIP-33): the plant on a scanned tag. Visitors cannot read
  // the specimens table, so public_plant_by_tag() (migration 20261030000000)
  // returns the plant only once it is approved on a published species, with an
  // endangered location already reduced. protectSpecimen() runs again here so
  // the API rule holds even if the function changes. Unknown, unused and
  // unpublished tags all get the same 404, so the answer says nothing about
  // plants that are not public yet.
  'get /public/tags/:qrId': async (req, res) => {
    if (tooMany(req, 'public-tag', { limit: TAG_LOOKUP_LIMIT, windowMs: TAG_LOOKUP_WINDOW_MS })) {
      res.set('Retry-After', String(TAG_LOOKUP_WINDOW_MS / 1000));
      return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many tag lookups. Wait a minute and try again.');
    }
    const notFound = () => fail(res, 404, 'NOT_FOUND', 'No published plant on this tag');
    const qrId = String(req.params.qrId).trim().toUpperCase();
    if (!QR_ID.test(qrId)) return notFound();

    try {
      const db = supabaseAnon();
      const { data, error } = await db.rpc('public_plant_by_tag', { p_qr_id: qrId });
      if (error) throw error;
      const plant = data?.[0];
      if (!plant) return notFound();
      const species = await loadPublicSpecies(db, plant.species_id);
      if (!species) return notFound();

      const shown = protectSpecimen(
        { ...plant, endangered_override: plant.location_reduced === true },
        { role: null, userId: null, status: species.conservation_status },
      );
      res.json({
        qr_id: plant.qr_id,
        lat: shown.lat ?? null,
        lng: shown.lng ?? null,
        location_reduced: shown.location_reduced,
        species,
      });
    } catch (error) {
      dbError(res, error);
    }
  },

  'get /me': async (req, res) => {
    const { data, error } = await supabaseAs(req.user)
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at, updated_at')
      .eq('id', req.user.id)
      .single();
    if (error) return dbError(res, error);
    res.json(data);
  },

  ...speciesHandlers,
  ...distributionHandlers,
  ...speciesMediaHandlers,
  ...observationHandlers,
  ...fieldHandlers,
  ...staffHandlers,
  ...sessionHandlers,
};
