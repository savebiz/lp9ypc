"use client";

import React, { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import JobCard from "@/components/jobs/JobCard";
import type { Job, CareerPath } from "@/types";

interface Props {
  initialJobs: Job[];
  careerPaths: CareerPath[];
  userId: string | null;
  initialSavedIds: string[];
}

const PATH_ICONS: Record<string, React.ReactNode> = {
  "business-entrepreneurship": <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M3 10h18v11H3z"/><path d="M10 14h4"/></svg>,
  "creative-industries":       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>,
  "engineering-pm":            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/></svg>,
  "finance-accounting":        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  "health-wellness":           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  "human-resources":           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  "law-compliance":            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
  "media-communications":      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>,
  "public-sector":             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V9l9-7 9 7v13"/><path d="M9 22V12h6v10"/></svg>,
  "tech-product":              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
};

export default function JobsClient({ initialJobs, careerPaths, userId, initialSavedIds }: Props) {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [activePaths, setActivePaths] = useState<string[]>([]);
  const [type, setType] = useState("all");
  const [level, setLevel] = useState("all");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds));
  const [toast, setToast] = useState("");

  const filtered = useMemo(() => initialJobs.filter((j) => {
    if (activePaths.length && j.career_paths && !activePaths.includes(j.career_paths.slug)) return false;
    if (type !== "all" && j.engagement_type !== type) return false;
    if (level !== "all" && j.experience_level !== level) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!j.title.toLowerCase().includes(s) && !j.company.toLowerCase().includes(s) && !(j.description?.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [initialJobs, q, activePaths, type, level]);

  function togglePath(slug: string) {
    setActivePaths((p) => p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2200); }

  async function toggleSave(jobId: string) {
    if (!userId) { window.location.href = "/login"; return; }
    if (savedIds.has(jobId)) {
      await supabase.from("saved_jobs").delete().eq("member_id", userId).eq("job_id", jobId);
      setSavedIds((s) => { const n = new Set(s); n.delete(jobId); return n; });
      showToast("Removed from saved");
    } else {
      await supabase.from("saved_jobs").insert({ member_id: userId, job_id: jobId });
      setSavedIds((s) => new Set([...s, jobId]));
      showToast("Saved to your profile");
    }
  }

  const SelectStyle = { padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--paper)", fontSize: 14, fontWeight: 500, color: "var(--ink)", cursor: "pointer" };

  return (
    <>
      {/* Filter row */}
      <div className="filter-row">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input placeholder="Search by title, company, skill…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} style={{ color: "#999", padding: 0, lineHeight: 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} style={SelectStyle}>
          <option value="all">All types</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="internship">Internship</option>
          <option value="graduate-trainee">Graduate Trainee</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={SelectStyle}>
          <option value="all">All levels</option>
          <option value="entry">Entry</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
        </select>
      </div>

      {/* Career path chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "20px 0 12px" }}>
        <button className={`chip${activePaths.length === 0 ? " on" : ""}`} onClick={() => setActivePaths([])}>All paths</button>
        {careerPaths.map((cp) => (
          <button key={cp.id} className={`chip${activePaths.includes(cp.slug) ? " on" : ""}`} onClick={() => togglePath(cp.slug)}>
            {PATH_ICONS[cp.slug]}
            {cp.name.split(" & ")[0]}
          </button>
        ))}
      </div>

      {/* Result count */}
      <p style={{ fontSize: 14, color: "#888", marginBottom: 0 }}>
        <strong style={{ color: "var(--blue)", fontFamily: "var(--font-display)", fontSize: 18 }}>{filtered.length}</strong> roles open
        {(q || activePaths.length || type !== "all" || level !== "all") && " (filtered)"}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          {initialJobs.length === 0
            ? "No jobs posted yet — check back soon."
            : "No jobs match those filters. Try clearing one."}
        </div>
      ) : (
        <div className="jobs-grid">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} isSaved={savedIds.has(j.id)} onToggleSave={userId ? toggleSave : undefined} />
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
