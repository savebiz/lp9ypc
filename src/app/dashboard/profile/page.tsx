import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ProfileForm from "./ProfileForm";
import { getSession } from "@/lib/session";
import type { CareerPath, Profile } from "@/types";

export const metadata = { title: "My profile · LP9 YPC" };

export default async function ProfilePage() {
  const { supabase, user, isAdmin, userName } = await getSession();
  if (!user) redirect("/login?next=/dashboard/profile");

  const [profileRes, pathsRes, mineRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("career_paths").select("*").order("name"),
    supabase.from("member_career_paths").select("career_path_id").eq("member_id", user.id),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile) {
    return (
      <>
        <Navbar user={user} isAdmin={isAdmin} userName={userName} />
        <main id="main" className="wrap wrap-form" style={{ padding: "40px 20px" }}>
          <div className="alert alert-error" role="alert">We couldn&apos;t load your profile. Please refresh, or sign out and back in.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-form" style={{ paddingBottom: 24 }}>
        <div className="page-head">
          <Link href="/dashboard" className="btn-link" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            <ArrowLeft size={18} aria-hidden="true" /> My dashboard
          </Link>
          <h1 className="title-lg">Your profile</h1>
          <p className="lede">Keep your details up to date so we can share the right opportunities.</p>
        </div>
        <ProfileForm
          profile={profile}
          careerPaths={(pathsRes.data ?? []) as CareerPath[]}
          initialPathIds={(mineRes.data ?? []).map((m) => m.career_path_id as string)}
        />
      </main>
      <Footer />
    </>
  );
}
