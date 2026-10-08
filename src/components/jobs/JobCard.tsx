"use client";

import Link from "next/link";
import type { Job } from "@/types";
import { formatDate, isExpired, isDeadlineSoon } from "@/lib/utils";

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
}

const CO_COLORS = ["#0B6BCB","#F08D11","#000000","#DA1F26","#0D2D81","#FF7900","#00338D","#1A1F36","#0F9D58","#006A4E","#FFC700"];

function getCoColor(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return CO_COLORS[h % CO_COLORS.length];
}

export default function JobCard({ job, isSaved, onToggleSave }: JobCardProps) {
  const expired = isExpired(job.deadline);
  const soon = isDeadlineSoon(job.deadline);
  const coColor = getCoColor(job.company);

  return (
    <div className="job" style={{ opacity: expired ? .65 : 1 }}>
      {/* Header */}
      <div className="job-head">
        <div className="row" style={{ gap: 14 }}>
          <div className="job-co" style={{ background: coColor }}>
            {job.company.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <h3>{job.title}</h3>
              {job.created_at && new Date(job.created_at) > new Date(Date.now() - 3 * 86400000) && (
                <span className="new-tag">NEW</span>
              )}
            </div>
            <div className="co">{job.company}{job.location ? ` · ${job.location}` : ""}</div>
          </div>
        </div>
        {onToggleSave && (
          <button onClick={() => onToggleSave(job.id)} style={{ padding: 8, color: isSaved ? "var(--blue)" : "#999", flexShrink: 0, transition: "color .15s" }} title={isSaved ? "Unsave" : "Save"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>
          </button>
        )}
      </div>

      {/* Tags */}
      <div className="job-meta">
        {job.career_paths && (
          <span className="chip sm">
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--blue)", display: "inline-block" }} />
            {job.career_paths.name.split(" & ")[0]}
          </span>
        )}
        {job.work_mode && <span className="chip sm">{job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}</span>}
        {job.engagement_type && <span className="chip sm">{job.engagement_type.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</span>}
        {job.experience_level && <span className="chip sm">{job.experience_level.charAt(0).toUpperCase() + job.experience_level.slice(1)} Level</span>}
      </div>

      {/* Description */}
      {job.description && (
        <p style={{ fontSize: 14, color: "#555", lineHeight: 1.5, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {job.description}
        </p>
      )}

      {/* Footer */}
      <div className="job-foot">
        <div className="salary">{job.salary_range ?? "Salary not listed"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: soon && !expired ? "var(--coral)" : "#888", fontWeight: soon ? 600 : 400 }}>
            {expired ? "Expired" : job.deadline ? `Due ${formatDate(job.deadline)}` : "Open"}
          </span>
          <a
            href={job.application_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            style={{ pointerEvents: expired ? "none" : "auto", opacity: expired ? .5 : 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            Apply
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>
          </a>
        </div>
      </div>
    </div>
  );
}
