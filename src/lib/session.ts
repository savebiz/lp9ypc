import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user (if any) plus the bits of their profile the page chrome
 * needs. getUser() validates the session with Supabase rather than trusting
 * the cookie, so it is safe to use for access decisions.
 */
export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userName = "";
  let isAdmin = false;
  if (user) {
    const { data } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    isAdmin = data?.role === "admin";
    userName = data?.full_name ?? "";
  }

  return { supabase, user, userName, isAdmin };
}

export { safeNextPath } from "@/lib/utils";
