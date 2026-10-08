import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Career path selection is now integrated into the 3-step register flow.
// If a logged-in member lands here (e.g. to update paths), redirect to dashboard.
export default async function CareerPathRedirect() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  redirect("/register");
}
