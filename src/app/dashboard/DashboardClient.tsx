"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import JobCard from "@/components/jobs/JobCard";
import type { Job } from "@/types";

interface Props {
  latestJobs: Job[];
  savedJobsData: { jobs: Job }[];
  userId: string;
}

const EVENTS = [
  { date: "JUN 12", title: "Career Switching Panel", loc: "YPC Hub, Lekki", tag: "Workshop" },
  { date: "JUN 20", title: "CV Clinic — 1:1 Reviews", loc: "Virtual", tag: "Coaching" },
  { date: "JUL 03", title: "Tech Founders Meetup", loc: "Yaba Co-Lab", tag: "Network" },
];

export default function DashboardClient({ latestJobs, savedJobsData, userId }: Props) {
  const supabase = createClient();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(savedJobsData.map((s) => s.jobs?.id).filter(Boolean)));
  const [savedJobs, setSavedJobs] = useState<Job[]>(savedJobsData.map((s) => s.jobs).filter(Boolean));

  async function toggleSave(jobId: string) {
    if (savedIds.has(jobId)) {
      await supabase.from("saved_jobs").delete().eq("member_id", userId).eq("job_id", jobId);
      setSavedIds((p) => { const n = new Set(p); n.delete(jobId); return n; });
      setSavedJobs((p) => p.filter((j) => j.id !== jobId));
    } else {
      await supabase.from("saved_jobs").insert({ member_id: userId, job_id: jobId });
      setSavedIds((p) => new Set([...p, jobId]));
    }
  }

  return (
    <>
      {/* Recommended jobs */}
      <div className="dash-section">
        <h3>Recommended for you <Link href="/jobs">See all →</Link></h3>
        {latestJobs.length === 0 ? (
          <div className="empty">No jobs posted yet — check back soon.</div>
        ) : (
          <div className="dash-jobs-grid">
            {latestJobs.map((j) => (
              <div key={j.id} style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 16, display: "flex", gap: 12, alignItems: "flex-start", transition: "border-color .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {j.company.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{j.title}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{j.company}{j.salary_range ? ` · ${j.salary_range}` : ""}</div>
                </div>
                <a href={j.application_link} target="_blank" rel="noopener noreferrer"
                  className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
                  Apply
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved jobs */}
      {savedJobs.length > 0 && (
        <div className="dash-section">
          <h3>Saved jobs <Link href="/jobs">Browse more →</Link></h3>
          <div className="dash-jobs-grid">
            {savedJobs.map((j) => (
              <JobCard key={j.id} job={j} isSaved={savedIds.has(j.id)} onToggleSave={toggleSave} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming events */}
      <div className="dash-section">
        <h3>Upcoming events <a href="#" style={{ fontSize: 14, fontWeight: 500, fontFamily: "var(--font-body)", color: "var(--blue)" }}>See all →</a></h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EVENTS.map((e) => (
            <div key={e.date} style={{ display: "flex", gap: 16, alignItems: "center", padding: 14, border: "1px solid var(--line)", borderRadius: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--ink)", color: "var(--accent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>
                <div style={{ fontSize: 10, opacity: .7 }}>{e.date.split(" ")[0]}</div>
                <div style={{ fontSize: 18 }}>{e.date.split(" ")[1]}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>{e.title}</div>
                <div style={{ fontSize: 13, color: "#666" }}>{e.loc} · {e.tag}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}>RSVP</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
