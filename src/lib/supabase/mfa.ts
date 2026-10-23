/**
 * Admin two-step sign-in (Supabase Auth MFA, TOTP authenticator apps).
 *
 * Off by default. When the server env ADMIN_MFA_REQUIRED is "true", admin
 * pages and requireAdmin() need a session at "aal2" (password + code).
 * Enrolment, codes and removal are handled by Supabase Auth itself (it also
 * refuses to add or remove a verified factor without aal2).
 *
 * Only `import type` here, so the pure helpers can be unit-tested with node.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AdminMfaState = { ok: true } | { ok: false; next: "verify" | "enrol" };

/** Server-only setting. Accepts "true" in any case, ignoring spaces. */
export function adminMfaRequired(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ADMIN_MFA_REQUIRED ?? "").trim().toLowerCase() === "true";
}

type FactorLike = { id: string; factor_type: string; status: string; friendly_name?: string; created_at: string };

/** The user's verified authenticator-app factors. */
export function verifiedTotpFactors(user: { factors?: FactorLike[] | null }): FactorLike[] {
  return (user.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
}

/** Pure decision: may this admin use admin tools, and if not, what next? */
export function decideAdminMfa(input: { required: boolean; currentLevel: string | null; hasVerifiedFactor: boolean }): AdminMfaState {
  if (!input.required || input.currentLevel === "aal2") return { ok: true };
  return { ok: false, next: input.hasVerifiedFactor ? "verify" : "enrol" };
}

type AuthClient = { auth: Pick<SupabaseClient["auth"], "getClaims"> };

/**
 * The session's assurance level from a VERIFIED access token (getClaims()
 * checks the signature, or asks Supabase for symmetric keys). Null on any
 * problem, which callers treat as "not aal2" (fail closed).
 */
export async function sessionAal(supabase: AuthClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims || data.claims.sub !== userId) return null;
    return typeof data.claims.aal === "string" ? data.claims.aal : null;
  } catch {
    return null;
  }
}

/** Full check for a signed-in admin (user from auth.getUser()). */
export async function adminMfaState(supabase: AuthClient, user: User): Promise<AdminMfaState> {
  const required = adminMfaRequired();
  if (!required) return { ok: true };
  const currentLevel = await sessionAal(supabase, user.id);
  return decideAdminMfa({ required, currentLevel, hasVerifiedFactor: verifiedTotpFactors(user).length > 0 });
}

/** Where the "enter your code" step may send an admin afterwards: admin pages only. */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || !/^\/admin(\/[A-Za-z0-9/_-]*)?$/.test(next)) return "/admin";
  if (next.startsWith("/admin/security/verify")) return "/admin";
  return next;
}
