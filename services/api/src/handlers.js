import { supabaseAnon, supabaseAs } from './supabase.js';
import { speciesHandlers, applySearch, parseSearch } from './species.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Implemented endpoints, keyed "method path" to match permissions.js.
// Anything not listed here answers 501 until someone builds it.
export const handlers = {
  // Also the botanist's species lookup on mobile (CTIP-26, CTIP-87).
  'get /public/species': async (req, res) => {
    const filters = parseSearch(req, res);
    if (!filters) return;
    const published = supabaseAnon()
      .from('species')
      .select('id, scientific_name, common_name, family, conservation_status')
      .eq('is_published', true)
      .eq('is_deleted', false);
    const { data, error } = await applySearch(published, filters).order('scientific_name');
    if (error) return res.status(500).json({ code: 'DB_ERROR', message: error.message });
    res.json({ data });
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
    const media = species_media.map(({ s3_bucket, s3_key, ...m }) => ({
      ...m,
      url: db.storage.from(s3_bucket).getPublicUrl(s3_key).data.publicUrl,
    }));
    const cover = media.find((m) => m.is_primary) ?? media[0];
    res.json({ ...fields, primary_image_url: cover?.url ?? null, media });
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
};
