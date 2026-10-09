"use client";

import { isExpired } from "@/lib/utils";
import type { CareerPath, Job, Profile } from "@/types";
import { Stat } from "./shared";
import styles from "../admin.module.css";

export default function OverviewTab({ jobs, members, careerPaths, memberPaths, pendingJobs, heldPosts, onGoTo }: {
  jobs: Job[];
  members: Profile[];
  careerPaths: CareerPath[];
  memberPaths: { member_id: string; career_path_id: string }[];
  pendingJobs: number;
  heldPosts: number;
  onGoTo: (tab: "review" | "moderation") => void;
}) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = members.filter((m) => new Date(m.created_at).getTime() > weekAgo).length;
  const activeJobs = jobs.filter((j) => j.is_active && j.review_status !== "pending" && j.review_status !== "rejected" && !isExpired(j.deadline)).length;
  const optedIn = members.filter((m) => m.consent_updates).length;

  const counts = careerPaths
    .map((cp) => ({ cp, n: memberPaths.filter((l) => l.career_path_id === cp.id).length }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...counts.map((c) => c.n));
  const withPath = new Set(memberPaths.map((l) => l.member_id));
  const noPath = members.filter((m) => !withPath.has(m.id)).length;

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat n={members.length} label="Registered members" />
        <Stat n={newThisWeek} label="Joined in the last 7 days" />
        <Stat n={activeJobs} label="Open jobs" />
        <Stat n={optedIn} label="Opted in to updates" />
        <ActionStat n={pendingJobs} label="Jobs awaiting review" cta="Review jobs" onClick={() => onGoTo("review")} />
        <ActionStat n={heldPosts} label="Posts needing review" cta="Check posts" onClick={() => onGoTo("moderation")} />
      </div>
      <section className="card" aria-labelledby="bypath-h">
        <h2 id="bypath-h" className="title-sm" style={{ marginBottom: 4 }}>Registrations by career path</h2>
        <p className="small muted" style={{ marginBottom: 16 }}>Members can choose more than one path.</p>
        {members.length === 0 ? (
          <p className="ink-2">No members yet.</p>
        ) : (
          <div className="bars">
            {counts.map(({ cp, n }) => (
              <div key={cp.id} className="bar-row">
                <span>{cp.name}</span>
                <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ display: "block", width: `${(n / max) * 100}%` }} /></span>
                <span className="count">{n}</span>
              </div>
            ))}
            {noPath > 0 && <p className="small muted">{noPath} member{noPath > 1 ? "s haven't" : " hasn't"} chosen a path yet.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

/** A stat that needs attention: shows a link-style button to the right tab when there's work to do. */
function ActionStat({ n, label, cta, onClick }: { n: number; label: string; cta: string; onClick: () => void }) {
  return (
    <div className={`stat${n > 0 ? ` ${styles.statAttention}` : ""}`}>
      <div className="num">{n}</div>
      <div className="lbl">{label}</div>
      {n > 0 && (
        <button type="button" className="btn-link small" onClick={onClick} style={{ paddingLeft: 0 }}>{cta}</button>
      )}
    </div>
  );
}
