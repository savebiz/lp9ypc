import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";
import { adminMfaRequired, sessionAal, verifiedTotpFactors } from "@/lib/supabase/mfa";
import SecurityClient, { type FactorSummary } from "./SecurityClient";

export const metadata = { title: "Two-step sign-in · Admin · LP9 YPC" };
export const dynamic = "force-dynamic";

/**
 * Admins set up, check and remove their authenticator app here. Reachable
 * WITHOUT aal2 on purpose (it is where admins enrol); Supabase Auth itself
 * refuses to add or remove apps on an account that has one until the code
 * has been entered.
 */
export default async function AdminSecurityPage() {
  const { supabase, user, isAdmin, userName } = await getSession();
  if (!user) redirect("/login?next=/admin/security");
  if (!isAdmin) redirect("/dashboard");

  const required = adminMfaRequired();
  const level = await sessionAal(supabase, user.id);
  const factors: FactorSummary[] = verifiedTotpFactors(user).map((f) => ({
    id: f.id,
    name: f.friendly_name ?? "",
    createdAt: f.created_at,
  }));
  const hasFactor = factors.length > 0;
  const confirmed = level === "aal2";

  return (
    <>
      <Navbar user={user} isAdmin userName={userName} />
      <main id="main" className="wrap wrap-form" style={{ paddingBottom: 48 }}>
        <div className="page-head">
          <Link href="/admin" className="btn-link" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            <ArrowLeft size={18} aria-hidden="true" /> Club dashboard
          </Link>
          <h1 className="title-lg">Two-step sign-in</h1>
          <p className="lede">
            Protect the admin tools with a 6-digit code from an app on your phone, as well as your password.
          </p>
        </div>

        <div className="stack">
          {required && !hasFactor && (
            <div className="alert alert-info" role="status">
              <CircleAlert size={18} aria-hidden="true" />
              <span>Two-step sign-in is now needed for the admin tools. Set it up below to continue.</span>
            </div>
          )}

          <section className="card card-white stack-sm" aria-labelledby="status-title">
            <h2 id="status-title" className="title-sm">Where things stand</h2>
            <p className="spread">
              <span className="ink-2">Your account</span>
              <span className={`status ${hasFactor ? "ok" : "off"}`}>
                {hasFactor ? `On (${factors.length} ${factors.length === 1 ? "app" : "apps"})` : "Not set up"}
              </span>
            </p>
            <p className="spread">
              <span className="ink-2">This sign-in</span>
              <span className={`status ${confirmed ? "ok" : "off"}`}>{confirmed ? "Code entered" : "Password only"}</span>
            </p>
            <p className="spread">
              <span className="ink-2">Needed for all admins</span>
              <span className={`status ${required ? "admin" : "off"}`}>{required ? "Yes" : "Not yet"}</span>
            </p>
            {!required && (
              <p className="hint">Once every admin has set it up, it will be switched on for all admins.</p>
            )}
          </section>

          <SecurityClient factors={factors} confirmed={confirmed} required={required} />
        </div>
      </main>
      <Footer />
    </>
  );
}
