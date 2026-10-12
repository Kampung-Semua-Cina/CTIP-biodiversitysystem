import { createClient } from '@supabase/supabase-js';

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Visitor queries: the publishable key, so only "public read" RLS policies apply.
export function supabaseAnon() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, options);
}

// Signed-in queries run as that user, so Supabase RLS is a second line of
// defence behind the API's role checks. Keep the secret key out of this path.
export function supabaseAs(user) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
}