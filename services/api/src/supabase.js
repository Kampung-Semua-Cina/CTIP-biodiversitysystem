import { createClient } from '@supabase/supabase-js';
import { timedFetch } from './dbLoad.js';

// timedFetch measures how busy the database is, for the apps' poll rate (dbLoad.js).
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } };

// Visitor queries: the publishable key, so only "public read" RLS policies apply.
// One shared client is enough because it never carries a user's token.
let anonClient;
export function supabaseAnon() {
  anonClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, options);
  return anonClient;
}

// A new client for one Auth call such as signUp, which leaves a session in the
// client it runs on. Never the shared one above, or later visitor queries
// would run as the new user.
export function supabaseFresh() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, options);
}

// Signed-in queries run as that user, so Supabase RLS is a second line of
// defence behind the API's role checks. Keep the secret key out of this path.
export function supabaseAs(user) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    ...options,
    global: { ...options.global, headers: { Authorization: `Bearer ${user.token}` } },
  });
}
