import { supabaseAnon, supabaseAs } from './supabase.js';
import { speciesHandlers, applySearch, parsePublicList } from './species.js';
import { distributionHandlers } from './distribution.js';
import { speciesMediaHandlers } from './speciesMedia.js';
import { observationHandlers } from './observations.js';
import { fieldHandlers } from './field.js';
import { staffHandlers } from './staff.js';
import { sessionHandlers } from './session.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public link for a species photo. Rows saved by older web builds may hold a
// full link instead of a Storage path.
const mediaUrl = (db, { s3_bucket, s3_key }) =>
  /^https?:/i.test(s3_key) ? s3_key : db.storage.from(s3_bucket).getPublicUrl(s3_key).data.publicUrl;

// The species' cover photo: the one marked primary, else the first by sort order.
export function coverUrl(db, media = []) {
  const cover = media.find((m) => m.is_primary) ?? [...media].sort((a, b) => a.sort_order - b.sort_order)[0];
  return cover ? mediaUrl(db, cover) : null;
}

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
    if (error) return res.status(500).json({ code: 'DB_ERROR', message: error.message });

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

  // Visitor QR page (CTIP-33). Columns are listed one by one so internal
  // fields never reach a visitor, and nothing here joins specimens, so no
  // coordinates can leak. RLS hides unpublished species as a second guard.
  'get /public/species/:id': async (req, res) => {
    const notFound = () => res.status(404).json({ code: 'NOT_FOUND', message: 'Species not found' });
    if (!UUID.test(req.params.id)) return notFound();

    const db = supabaseAnon();
    const { data: species, error } = await db
      .from('species')
      .select(`id, scientific_name, common_name, family, genus, description, conservation_status,
        cultural_significance, species_media (id, species_id, s3_bucket, s3_key, caption, credit,
        is_primary, sort_order, created_at)`)
      .eq('id', req.params.id)
      .eq('is_published', true)
      .eq('is_deleted', false)
      .order('sort_order', { referencedTable: 'species_media' })
      .maybeSingle();
    if (error) return res.status(500).json({ code: 'DB_ERROR', message: error.message });
    if (!species) return notFound();

    const { species_media, ...fields } = species;
    const media = species_media.map(({ s3_bucket, s3_key, ...m }) => ({ ...m, url: mediaUrl(db, { s3_bucket, s3_key }) }));
    res.json({ ...fields, primary_image_url: coverUrl(db, species_media), media });
  },

  'get /me': async (req, res) => {
    const { data, error } = await supabaseAs(req.user)
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at, updated_at')
      .eq('id', req.user.id)
      .single();
    if (error) return res.status(500).json({ code: 'DB_ERROR', message: error.message });
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
