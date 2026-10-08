import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JobsClient from "./JobsClient";
import type { Job, CareerPath } from "@/types";

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  let savedJobIds: string[] = [];
  let userName = "";

  if (user) {
    const { data: p } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    isAdmin = p?.role === "admin";
    userName = p?.full_name ?? "";
    const { data: saved } = await supabase.from("saved_jobs").select("job_id").eq("member_id", user.id);
    savedJobIds = (saved ?? []).map((s: { job_id: string }) => s.job_id);
  }

  const { data: jobs } = await supabase
    .from("jobs").select("*, career_paths(*)")
    .eq("is_active", true)
    .order("created_at", { ascending: false }) as { data: Job[] | null };

  const { data: careerPaths } = await supabase
    .from("career_paths").select("*").order("name") as { data: CareerPath[] | null };

  return (
    <div>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />

      <section className="wrap page-head">
        <span className="eyebrow">Opportunities</span>
        <h1>The jobs board.<br />
          <span style={{ color: "var(--blue)" }}>{(jobs ?? []).length}</span> roles open.
        </h1>
        <p style={{ color: "#555", fontSize: 16, marginTop: 12 }}>
          Tap <strong>Apply</strong> on any listing to go directly to the application page.
        </p>
        <JobsClient
          initialJobs={jobs ?? []}
          careerPaths={careerPaths ?? []}
          userId={user?.id ?? null}
          initialSavedIds={savedJobIds}
        />
      </section>

      <Footer />
    </div>
  );
}
