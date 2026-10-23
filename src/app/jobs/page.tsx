import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JobsClient, { type PathOption } from "./JobsClient";
import { fetchJobsPage } from "./jobs-query";
import { getSession } from "@/lib/session";

export const metadata = { title: "Jobs · LP9 YPC" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ path?: string; q?: string }> }) {
  const { path, q } = await searchParams;
  const { supabase, user, userName, isAdmin } = await getSession();
  const initialQuery = typeof q === "string" ? q.slice(0, 100) : "";

  // Career paths come from the database (11 today), so a new path shows up as
  // a filter chip without a code change. Resolved once and shared below.
  const pathsPromise = (async () => {
    const { data } = await supabase.from("career_paths").select("id, name, slug").order("name");
    return (data ?? []) as PathOption[];
  })();

  const firstPagePromise = pathsPromise.then((careerPaths) => {
    const initialPathId = typeof path === "string" ? careerPaths.find((c) => c.slug === path)?.id : undefined;
    return fetchJobsPage(supabase, {
      q: initialQuery,
      pathIds: initialPathId ? [initialPathId] : [],
      workMode: null,
      type: null,
      level: null,
      location: null,
    });
  });

  const [careerPaths, firstPage, savedRes, locRes] = await Promise.all([
    pathsPromise,
    firstPagePromise,
    user
      ? supabase.from("saved_jobs").select("job_id").eq("member_id", user.id)
      : Promise.resolve({ data: [] as { job_id: string }[] }),
    // The Location filter lists every place among live jobs (one short column).
    supabase.from("jobs").select("location").eq("is_active", true).eq("review_status", "approved")
      .not("location", "is", null).limit(2000),
  ]);

  const savedIds = (savedRes.data ?? []).map((s) => s.job_id);
  const locations = [
    ...new Set(((locRes.data ?? []) as { location: string | null }[]).map((r) => r.location).filter((l): l is string => !!l?.trim())),
  ].sort((a, b) => a.localeCompare(b));

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
          initialPage={firstPage}
          careerPaths={careerPaths}
          locations={locations}
          userId={user?.id ?? null}
          initialSavedIds={savedIds}
          initialPath={typeof path === "string" ? path : null}
          initialQuery={initialQuery}
        />
      </main>
      <Footer />
    </>
  );
}
