/**
 * Supabase client used for browser-side auth.
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
 * `.env.local`. Both values are public by design — only the anon key ships
 * to the browser. Service-role keys must never be referenced here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The Supabase client, or `null` when the required env vars are missing.
 * UI code should call `isSupabaseConfigured()` before using the client and
 * fall back to a configuration error message when it is `null`.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase isn’t configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the dev server.";
