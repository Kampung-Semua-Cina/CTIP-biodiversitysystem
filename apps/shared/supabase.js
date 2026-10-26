// apps/shared/supabase.js
import { createClient } from "@supabase/supabase-js";

// Read from Vite environment variables with fallback to configured project credentials
const SUPABASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL)
  || "https://cgtvoirktzqjqaosslfh.supabase.co";

const SUPABASE_ANON_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY)
  || "sb_publishable_gbGnDBj09s7kG_5VJfgaNw_n8ICe-zY";

const SUPABASE_SECRET_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_SECRET_KEY)
  || "sb_secret_eRIvLWVz-JSSZ4gSvzPIgA_J6UZUpgt";

let supabaseClient = null;
let supabaseAdmin = null;

export function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseAdmin;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY };
