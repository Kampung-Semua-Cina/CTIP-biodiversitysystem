// apps/shared/supabase.js
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://cgtvoirktzqjqaosslfh.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_14IvAFZC0nZZy7_mUl5wTQ_bPegxECk";

// Read environment variables with fallback to project default (ensures builds without local .env still resolve)
const rawUrl =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_SUPABASE_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) ||
  DEFAULT_SUPABASE_URL;

const rawKey =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)) ||
  DEFAULT_SUPABASE_ANON_KEY;

// Guard against non-existent placeholder domain causing UnknownHostException
const SUPABASE_URL = !rawUrl || rawUrl.includes("placeholder.supabase.co") ? DEFAULT_SUPABASE_URL : rawUrl;
const SUPABASE_ANON_KEY = !rawKey || rawKey.includes("placeholder-anon-key") ? DEFAULT_SUPABASE_ANON_KEY : rawKey;

let supabaseClient = null;

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

export { SUPABASE_URL, SUPABASE_ANON_KEY };
