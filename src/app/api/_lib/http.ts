/**
 * Route-handler helpers: JSON responses and the auth gates every API route
 * uses (lp9-supabase: identify with the session client's auth.getUser(),
 * authorise, THEN write with the service role).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthStatus, isSameOrigin, readJsonBody } from "./guards";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** `{ ok: false, error }` with a friendly, member-safe message. */
export function fail(status: number, error: string): NextResponse {
  return json({ ok: false, error }, status);
}

export const MESSAGES = {
  badOrigin: "This request wasn't allowed. Please reload the page and try again.",
  signIn: "Please sign in first.",
  notAdmin: "Only admins can do that.",
  serviceUnavailable: "This isn't available right now because the server isn't fully set up. Please try again later.",
  serverError: "Something went wrong on our side. Please try again.",
} as const;

/** 403 unless the Origin header matches this site's origin. */
export function checkOrigin(req: Request): NextResponse | null {
  return isSameOrigin(req.headers.get("origin"), req.url) ? null : fail(403, MESSAGES.badOrigin);
}

export async function parseBody(
  req: Request,
  opts: { allowEmpty?: boolean } = {},
): Promise<{ data: Record<string, unknown>; response?: undefined } | { data?: undefined; response: NextResponse }> {
  const body = await readJsonBody(req, opts);
  return body.ok ? { data: body.data } : { response: fail(body.status, body.error) };
}

export type SessionClient = Awaited<ReturnType<typeof createClient>>;

/** The verified user (auth.getUser() checks the session with Supabase) or a 401. */
export async function requireUser(): Promise<
  { supabase: SessionClient; user: User; response?: undefined } | { response: NextResponse }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { response: fail(401, MESSAGES.signIn) };
    return { supabase, user: data.user };
  } catch {
    return { response: fail(401, MESSAGES.signIn) };
  }
}

/** requireUser() + profiles.role = 'admin', else 403. */
export async function requireAdmin(): Promise<
  { supabase: SessionClient; user: User; response?: undefined } | { response: NextResponse }
> {
  const auth = await requireUser();
  if (auth.response) return auth;
  const { data, error } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (error || (data as { role?: string } | null)?.role !== "admin") return { response: fail(403, MESSAGES.notAdmin) };
  return auth;
}

/** The service-role client, or a 503 when SUPABASE_SERVICE_ROLE_KEY isn't set. */
export function requireServiceRole(): { admin: SupabaseClient; response?: undefined } | { response: NextResponse } {
  const admin = createAdminClient();
  return admin ? { admin } : { response: fail(503, MESSAGES.serviceUnavailable) };
}

/** Cron gate: 503 when CRON_SECRET is unset, 401 on a wrong bearer token. */
export function checkCron(req: Request): NextResponse | null {
  const status = cronAuthStatus(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (status === 503) return fail(503, "CRON_SECRET is not configured.");
  if (status === 401) return fail(401, "Unauthorized.");
  return null;
}
