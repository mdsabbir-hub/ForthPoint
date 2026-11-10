import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous client for public pages. It never carries a login session, so even a signed-in
 * administrator sees only what the public sees. Returns null when Supabase is not configured.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
