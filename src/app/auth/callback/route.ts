import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/session";

/**
 * Landing point for the email-confirmation link. Supabase has already verified
 * the email by the time it redirects here; this exchanges the one-time code
 * for a session so the member arrives signed in.
 *
 * If the link is opened on a different device or browser from the one used to
 * register, the code can't be exchanged (PKCE). The email is still confirmed,
 * so we send them to sign in with a clear message instead of an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?notice=link-expired`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?notice=confirmed`);
}
