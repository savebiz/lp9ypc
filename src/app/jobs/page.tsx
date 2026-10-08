import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JobsClient from "./JobsClient";
import { getSession } from "@/lib/session";
import type { CareerPath, Job } from "@/types";

export const metadata = { title: "Jobs · LP9 YPC" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  const { supabase, user, userName, isAdmin } = await getSession();

  const [jobsRes, pathsRes, savedRes] = await Promise.all([
    supabase.from("jobs").select("*, career_paths(*)").eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("career_paths").select("*").order("name"),
    user
      ? supabase.from("saved_jobs").select("job_id").eq("member_id", user.id)
      : Promise.resolve({ data: [] as { job_id: string }[] }),
  ]);

  const jobs = (jobsRes.data ?? []) as Job[];
  const careerPaths = (pathsRes.data ?? []) as CareerPath[];
  const savedIds = (savedRes.data ?? []).map((s) => s.job_id);

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap">
        <div className="page-head">
          <span className="eyebrow">Jobs &amp; opportunities</span>
          <h1 className="title-lg">Find your next role.</h1>
          <p className="lede">Tap <strong>Apply now</strong> on any job to go straight to its application page.</p>
        </div>
        <JobsClient
          initialJobs={jobs}
          careerPaths={careerPaths}
          userId={user?.id ?? null}
          initialSavedIds={savedIds}
          initialPath={path ?? null}
        />
      </main>
      <Footer />
    </>
  );
}
