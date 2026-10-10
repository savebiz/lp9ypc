"use client";

import { ChevronRight } from "lucide-react";
import { firstName, isExpired } from "@/lib/utils";
import type { AdminAuditEntry, CareerPath, Job, JobSource, Profile } from "@/types";
import type { Tab } from "../AdminClient";
import { Stat, formatDateTime } from "./shared";
import styles from "../admin.module.css";

export interface OverviewQueues {
  pendingJobs: number;
  heldPosts: number;
  openReports: number;
  careerIdeas: number;
  sourceProblems: number;
  testAccounts: number;
  /** New feedback items; null when the feedback table isn't set up yet (the line is hidden). */
  newFeedback: number | null;
}

/** A live job whose Apply link has 2 or more open "link" reports (Phase 3.2). */
export interface BrokenLinkJob {
  job: Job;
  reports: number;
  /** Failed checks in a row from the link checker, when known. */
  failCount: number | null;
}

export default function OverviewTab({ jobs, members, careerPaths, memberPaths, queues, audit, jobSources, brokenLinks = [], onGoTo, onFixJob }: {
  jobs: Job[];
  members: Profile[];
  careerPaths: CareerPath[];
  memberPaths: { member_id: string; career_path_id: string }[];
  queues: OverviewQueues;
  audit: AdminAuditEntry[];
  jobSources: JobSource[];
  brokenLinks?: BrokenLinkJob[];
  onGoTo: (tab: Tab) => void;
  /** Opens the Jobs tab with this job in the editor. */
  onFixJob?: (jobId: string) => void;
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

  // Every queue, with a direct link. Shown even at zero so admins know where things live.
  const queueLinks: { n: number; label: string; tab: Tab; none: string }[] = [
    { n: queues.pendingJobs, label: "Jobs waiting for review", tab: "review", none: "No jobs waiting" },
    { n: queues.heldPosts, label: "Posts needing review", tab: "moderation", none: "No posts waiting" },
    { n: queues.openReports, label: "Open reports from members", tab: "moderation", none: "No open reports" },
    { n: queues.careerIdeas, label: "Career path ideas to review", tab: "ideas", none: "No new ideas" },
    { n: queues.sourceProblems, label: "Job sources with a problem", tab: "sources", none: "All job sources fine" },
    ...(queues.newFeedback !== null
      ? [{ n: queues.newFeedback, label: "New feedback from members", tab: "feedback" as Tab, none: "No new feedback" }]
      : []),
    ...(queues.testAccounts > 0
      ? [{ n: queues.testAccounts, label: "Test accounts to delete before launch", tab: "members" as Tab, none: "" }]
      : []),
  ];
  const waiting = queueLinks.reduce((sum, q) => sum + q.n, 0) + brokenLinks.length;

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat n={members.length} label="Registered members" />
        <Stat n={newThisWeek} label="Joined in the last 7 days" />
        <Stat n={activeJobs} label="Open jobs" />
        <Stat n={optedIn} label="Opted in to updates" />
      </div>

      <section className="card" aria-labelledby="queues-h">
        <h2 id="queues-h" className="title-sm" style={{ marginBottom: 4 }}>Needs your attention</h2>
        <p className="small muted" style={{ marginBottom: 12 }}>
          {waiting === 0 ? "You're all caught up." : "Tap a line to go straight to it."}
        </p>
        <ul className={styles.queueList}>
          {/* Broken Apply links come first: applying is the most important thing members do here. */}
          {brokenLinks.map(({ job, reports, failCount }) => (
            <li key={`link-${job.id}`}>
              <button type="button" className={`${styles.queueLink} ${styles.queueLinkOn}`}
                onClick={() => (onFixJob ? onFixJob(job.id) : onGoTo("feedback"))}>
                <span className={styles.queueCount}>{reports}</span>
                <span className={styles.queueLabel}>
                  Apply link may be broken: {job.title}
                  <span className="small muted" style={{ display: "block" }}>
                    {reports} open reports{failCount && failCount >= 2 ? ` · the link checker couldn't open it ${failCount} times in a row` : ""}. Tap to fix the link.
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
          {queueLinks.map((q) => (
            <li key={q.label}>
              <button type="button" className={`${styles.queueLink}${q.n > 0 ? ` ${styles.queueLinkOn}` : ""}`} onClick={() => onGoTo(q.tab)}>
                <span className={styles.queueCount}>{q.n}</span>
                <span className={styles.queueLabel}>{q.n > 0 || !q.none ? q.label : q.none}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ActivityLog audit={audit} members={members} jobSources={jobSources} />

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

const RUN_RESULT: Record<string, string> = {
  ok: "it worked",
  empty: "no jobs found on the page",
  blocked: "the site blocked us",
  error: "it ran into a problem",
};

/** One audit row as a plain-English sentence. Names only — never contact details. */
function describe(e: AdminAuditEntry, memberName: Map<string, string>, sourceName: Map<string, string>): string {
  const actor = e.actor_id ? memberName.get(e.actor_id) : undefined;
  const who = actor ? firstName(actor) : e.actor_id ? "An admin" : "An admin (account since removed)";
  const d = e.details ?? {};
  switch (e.action) {
    case "member.role_change": {
      const target = (e.target_id && memberName.get(e.target_id)) || "a member";
      return d.to === "admin" ? `${who} made ${target} an admin` : `${who} removed admin access from ${target}`;
    }
    case "job_source.run": {
      const src = (e.target_id && sourceName.get(e.target_id)) || "a job source";
      const n = typeof d.inserted === "number" ? d.inserted : 0;
      const result = typeof d.status === "string" ? RUN_RESULT[d.status] ?? d.status : "";
      return `${who} ran the job finder on ${src}${result ? ` — ${result}` : ""}, ${n} new job${n === 1 ? "" : "s"} for review`;
    }
    case "feedback.update": {
      const label: Record<string, string> = { new: "New", looking: "Looking into it", fixed: "Fixed", not_now: "Not now" };
      const s = typeof d.status === "string" ? label[d.status] : undefined;
      return s ? `${who} updated a feedback item (now: ${s})` : `${who} updated a feedback item`;
    }
    default:
      return `${who}: ${e.action.replace(/[._]/g, " ")}`;
  }
}

/** Newest 50 sensitive admin actions (admin_audit). The first 8 show; the rest fold away. */
function ActivityLog({ audit, members, jobSources }: { audit: AdminAuditEntry[]; members: Profile[]; jobSources: JobSource[] }) {
  const memberName = new Map(members.filter((m) => m.full_name?.trim()).map((m) => [m.id, m.full_name.trim()]));
  const sourceName = new Map(jobSources.map((s) => [s.id, s.name]));
  const row = (e: AdminAuditEntry) => (
    <li key={e.id} className={styles.activityRow}>
      <span>{describe(e, memberName, sourceName)}</span>
      <time className="small muted" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
    </li>
  );
  return (
    <section className="card" aria-labelledby="activity-h">
      <h2 id="activity-h" className="title-sm" style={{ marginBottom: 4 }}>Activity log</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>
        A permanent record of sensitive admin actions, such as changing who is an admin or running the job finder.
      </p>
      {audit.length === 0 ? (
        <p className="ink-2">Nothing recorded yet.</p>
      ) : (
        <>
          <ul className={styles.activityList}>{audit.slice(0, 8).map(row)}</ul>
          {audit.length > 8 && (
            <details className={styles.details}>
              <summary className="small">Show older activity ({audit.length - 8})</summary>
              <ul className={styles.activityList}>{audit.slice(8).map(row)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
