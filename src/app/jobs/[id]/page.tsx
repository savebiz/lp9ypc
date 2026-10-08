import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { formatDate, isExpired } from "@/lib/utils";
import type { Job } from "@/types";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  let userName = "";
  if (user) {
    const { data: p } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    isAdmin = p?.role === "admin";
    userName = p?.full_name ?? "";
  }

  const { data: job } = await supabase.from("jobs").select("*, career_paths(*)").eq("id", id).single() as { data: Job | null };
  if (!job) notFound();

  const expired = isExpired(job.deadline);

  return (
    <div>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />

      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 800 }}>
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#888", marginBottom: 32 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m11 5-7 7 7 7"/></svg>
          Back to Jobs
        </Link>

        <div className="card" style={{ padding: 40 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 32 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, letterSpacing: "-0.02em", margin: "0 0 8px", lineHeight: 1.1 }}>{job.title}</h1>
              <p style={{ fontSize: 20, color: "var(--blue)", fontWeight: 600, margin: 0 }}>{job.company}</p>
            </div>
            {job.career_paths && (
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 40 }}>{job.career_paths.icon}</div>
                <p style={{ fontSize: 12, color: "#888", marginTop: 4, maxWidth: 80, lineHeight: 1.3 }}>{job.career_paths.name}</p>
              </div>
            )}
          </div>

          {/* Meta chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
            {job.location && <span className="chip">{job.location}</span>}
            {job.work_mode && <span className="chip">{job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}</span>}
            {job.engagement_type && <span className="chip">{job.engagement_type.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</span>}
            {job.experience_level && <span className="chip">{job.experience_level.charAt(0).toUpperCase() + job.experience_level.slice(1)} Level</span>}
            {job.salary_range && (
              <span className="chip" style={{ background: "var(--cream)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.5 8h5a1.5 1.5 0 0 1 0 3h-5v5"/><path d="M9.5 8v8"/></svg>
                {job.salary_range}
              </span>
            )}
          </div>

          {/* Apply CTA */}
          <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 20, padding: 32, textAlign: "center", marginBottom: 32 }}>
            <p style={{ color: "#555", fontSize: 15, marginBottom: 16, marginTop: 0 }}>
              {expired
                ? "This listing has expired. Browse other open roles below."
                : `Deadline: ${formatDate(job.deadline)} — tap the button to open the application page directly.`}
            </p>
            <a
              href={job.application_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent"
              style={{ fontSize: 16, padding: "16px 32px", pointerEvents: expired ? "none" : "auto", opacity: expired ? .5 : 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
              {expired ? "Application Closed" : "Apply Now — Open Application Page"}
            </a>
            {!expired && <p style={{ fontSize: 12, color: "#aaa", margin: "10px 0 0" }}>Opens in a new tab</p>}
          </div>

          {/* Description */}
          {job.description && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 16px" }}>About this role</h2>
              <div style={{ color: "#444", lineHeight: 1.7, fontSize: 15, whiteSpace: "pre-wrap" }}>{job.description}</div>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 13, color: "#aaa", margin: 0 }}>
              Posted {new Date(job.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <Link href="/jobs" style={{ fontSize: 14, color: "var(--blue)", fontWeight: 600 }}>← All jobs</Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
