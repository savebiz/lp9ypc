import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import AdminClient from "./AdminClient";
import { getSession } from "@/lib/session";
import type { Announcement, CareerPath, Job, Profile } from "@/types";

export const metadata = { title: "Admin · LP9 YPC" };

export default async function AdminPage() {
  const { supabase, user, isAdmin, userName } = await getSession();
  if (!user) redirect("/login?next=/admin");
  // Server-side role check. The database's row-level security enforces the
  // same rule on every query, so this page can't leak data even if bypassed.
  if (!isAdmin) redirect("/dashboard");

  const [jobsRes, membersRes, pathsRes, annRes, linksRes] = await Promise.all([
    supabase.from("jobs").select("*, career_paths(*)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("career_paths").select("*").order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("member_career_paths").select("member_id, career_path_id"),
  ]);

  const loadError = [jobsRes, membersRes, pathsRes, annRes, linksRes].some((r) => r.error);

  return (
    <div className="admin">
      <Navbar user={user} isAdmin userName={userName} />
      <main id="main" className="wrap" style={{ paddingBottom: 48 }}>
        <div className="page-head">
          <span className="eyebrow">Admin</span>
          <h1 className="title-lg">Club dashboard</h1>
          <p className="lede">Post and manage jobs, see who has registered, and share announcements.</p>
        </div>
        {loadError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
            Some data didn&apos;t load. Refresh the page; if it keeps happening, check the Supabase project is running.
          </div>
        )}
        <AdminClient
          jobs={(jobsRes.data ?? []) as Job[]}
          members={(membersRes.data ?? []) as Profile[]}
          careerPaths={(pathsRes.data ?? []) as CareerPath[]}
          announcements={(annRes.data ?? []) as Announcement[]}
          memberPaths={(linksRes.data ?? []) as { member_id: string; career_path_id: string }[]}
        />
      </main>
    </div>
  );
}
