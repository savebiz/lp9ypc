import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getSession } from "@/lib/session";
import { safeAdminNext, sessionAal, verifiedTotpFactors } from "@/lib/supabase/mfa";
import VerifyClient from "./VerifyClient";

export const metadata = { title: "Enter your code · Admin · LP9 YPC" };
export const dynamic = "force-dynamic";

/** The "Enter your 6-digit code" step for admins who have an authenticator app. */
export default async function AdminVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeAdminNext(typeof rawNext === "string" ? rawNext : null);

  const { supabase, user, isAdmin, userName } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/security/verify?next=${next}`)}`);
  if (!isAdmin) redirect("/dashboard");

  const factors = verifiedTotpFactors(user).map((f) => ({ id: f.id, name: f.friendly_name ?? "" }));
  if (factors.length === 0) redirect("/admin/security");
  if ((await sessionAal(supabase, user.id)) === "aal2") redirect(next);

  return (
    <>
      <Navbar user={user} isAdmin userName={userName} />
      <main id="main" className="wrap wrap-form" style={{ paddingBottom: 48 }}>
        <div className="page-head">
          <span className="eyebrow">Admin</span>
          <h1 className="title-lg">Enter your 6-digit code</h1>
          <p className="lede">Open your authenticator app and type the code it shows for LP9 YPC.</p>
        </div>
        <VerifyClient factors={factors} next={next} />
      </main>
    </>
  );
}
