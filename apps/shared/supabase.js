// apps/shared/supabase.js
import { createClient } from "@supabase/supabase-js";

// Read exclusively from environment variables with zero hardcoded credentials
const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && (process.env?.EXPO_PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL || process.env?.VITE_SUPABASE_URL)) ||
  "";

const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && (process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY || process.env?.SUPABASE_PUBLISHABLE_KEY || process.env?.VITE_SUPABASE_ANON_KEY)) ||
  "";

let supabaseClient = null;

export function getSupabase() {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("Supabase credentials missing: check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
    }
    supabaseClient = createClient(SUPABASE_URL || "https://placeholder.supabase.co", SUPABASE_ANON_KEY || "placeholder-anon-key", {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
