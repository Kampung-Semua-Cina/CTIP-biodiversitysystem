import { supabaseAnon, supabaseAs } from './supabase.js';

// Implemented endpoints, keyed "method path" to match permissions.js.
// Anything not listed here answers 501 until someone builds it.
export const handlers = {
  'get /public/species': async (req, res) => {
    const { data, error } = await supabaseAnon()
      .from('species')
      .select('id, scientific_name, common_name, family, conservation_status')
      .eq('is_published', true)
      .eq('is_deleted', false)
      .order('scientific_name');
    if (error) return res.status(500).json({ code: 'DB_ERROR', message: error.message });
    res.json({ data });
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
};
