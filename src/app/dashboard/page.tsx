import { redirect } from "next/navigation";
import Link from "next/link";
import { PartyPopper, Pencil } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";
import { PathIcon } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import { firstName, formatDate, shortPathName } from "@/lib/utils";
import type { Announcement, Job, MemberCareerPath, Profile } from "@/types";

export const metadata = { title: "My dashboard · LP9 YPC" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { supabase, user, isAdmin } = await getSession();
  if (!user) redirect("/login?next=/dashboard");

  const [profileRes, pathsRes, savedRes, jobsRes, annRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("member_career_paths").select("*, career_paths(*)").eq("member_id", user.id),
    supabase.from("saved_jobs").select("job_id, jobs(*, career_paths(*))").eq("member_id", user.id).order("created_at", { ascending: false }),
    supabase.from("jobs").select("*, career_paths(*)").eq("is_active", true).order("created_at", { ascending: false }).limit(40),
    supabase.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(3),
  ]);

  const profile = profileRes.data as Profile | null;
  const memberPaths = ((pathsRes.data ?? []) as MemberCareerPath[]).filter((m) => m.career_paths);
  // Saved jobs whose listing was archived come back with jobs = null (RLS hides them); drop those.
  const savedJobs = ((savedRes.data ?? []) as unknown as { job_id: string; jobs: Job | null }[])
    .map((s) => s.jobs)
    .filter((j): j is Job => !!j);
  const latest = (jobsRes.data ?? []) as Job[];
  const announcements = (annRes.data ?? []) as Announcement[];

  const pathIds = new Set(memberPaths.map((m) => m.career_path_id));
  const matched = latest.filter((j) => j.career_path_id && pathIds.has(j.career_path_id));
  const forYou = (matched.length ? matched : latest).slice(0, 4);
  const forYouTitle = matched.length ? "Jobs for your paths" : "Latest jobs";

  const missing = [
    !profile?.employment_status && "employment status",
    !profile?.preferred_work_mode && "preferred work mode",
    memberPaths.length === 0 && "career paths",
  ].filter(Boolean) as string[];

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={profile?.full_name ?? ""} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        {welcome && (
          <div className="alert alert-ok" role="status" style={{ marginTop: 24 }}>
            <PartyPopper size={20} aria-hidden="true" />
            <span><strong>Welcome to LP9 YPC!</strong> Your account is ready. Start with the jobs picked for your career paths below.</span>
          </div>
        )}

        <div className="hello">
          <h1>Hi, {firstName(profile?.full_name)}</h1>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            {memberPaths.map((m) => (
              <span key={m.id} className="chip">
                <PathIcon slug={m.career_paths!.slug} size={14} className="text-blue" />
                {shortPathName(m.career_paths!.name)}
              </span>
            ))}
            <Link href="/dashboard/profile#paths" className="btn-link">
              <Pencil size={16} aria-hidden="true" /> {memberPaths.length ? "Edit paths" : "Choose your career paths"}
            </Link>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 20 }}>
          <DashboardClient
            userId={user.id}
            forYou={forYou}
            forYouTitle={forYouTitle}
            saved={savedJobs}
          />

          {announcements.length > 0 && (
            <section className="panel" aria-labelledby="ann-h">
              <div className="panel-head"><h2 id="ann-h">Announcements</h2></div>
              <div className="announcements">
                {announcements.map((a) => (
                  <article key={a.id} className="announcement">
                    <div>
                      <h3>{a.title}</h3>
                      {a.content && <p>{a.content}</p>}
                      <time dateTime={a.created_at}>{formatDate(a.created_at)}</time>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="panel" aria-labelledby="profile-h">
            <div className="panel-head">
              <h2 id="profile-h">Your profile</h2>
              <Link href="/dashboard/profile" className="btn btn-ghost btn-sm">Update profile</Link>
            </div>
            <dl className="facts">
              <div><dt>Email</dt><dd style={{ overflowWrap: "anywhere" }}>{profile?.email || user.email}</dd></div>
              <div><dt>Phone</dt><dd>{profile?.phone || "—"}</dd></div>
              <div><dt>Profession</dt><dd>{profile?.profession || "—"}</dd></div>
              <div><dt>Area / parish</dt><dd>{profile?.area_of_residence || "—"}</dd></div>
            </dl>
            {missing.length > 0 && (
              <p className="small ink-2" style={{ marginTop: 14 }}>
                Add your {missing.join(", ")} so we can match you with better opportunities.
              </p>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
