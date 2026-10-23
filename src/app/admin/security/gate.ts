import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { adminMfaState } from "@/lib/supabase/mfa";
import type { createClient } from "@/lib/supabase/server";

/**
 * For admin PAGES (server components), after the admin role check. When
 * ADMIN_MFA_REQUIRED=true and this session isn't aal2: admins with an
 * authenticator app go to the "Enter your 6-digit code" step; admins
 * without one go to /admin/security to set it up. Otherwise returns.
 */
export async function requireAdminMfa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
  nextPath = "/admin",
): Promise<void> {
  const state = await adminMfaState(supabase, user);
  if (state.ok) return;
  redirect(state.next === "verify" ? `/admin/security/verify?next=${encodeURIComponent(nextPath)}` : "/admin/security");
}
