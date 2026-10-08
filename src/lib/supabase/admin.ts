import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVICE-ROLE Supabase client. Bypasses row-level security entirely.
 *
 * Rules (see .claude/skills/lp9-supabase in the brain repo):
 *  - Import ONLY from server code: route handlers under src/app/api/** and
 *    modules under src/lib/agents/**. Never from a component or page.
 *  - Before every write, the calling route must already have verified who the
 *    user is and that they're allowed to do this (session, membership, role).
 *  - SUPABASE_SERVICE_ROLE_KEY must never be given a NEXT_PUBLIC_ prefix.
 *
 * Returns null when the key isn't configured, so features can degrade
 * gracefully instead of crashing.
 */
export function createAdminClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() is server-only");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
