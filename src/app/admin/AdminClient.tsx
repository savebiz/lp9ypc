"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2, X } from "lucide-react";
import type { CareerPath } from "@/types";
import { isTestAccount, type AdminData } from "./tabs/shared";
import OverviewTab from "./tabs/OverviewTab";
import JobsTab from "./tabs/JobsTab";
import ReviewQueueTab from "./tabs/ReviewQueueTab";
import JobSourcesTab from "./tabs/JobSourcesTab";
import MembersTab from "./tabs/MembersTab";
import CommunitiesTab from "./tabs/CommunitiesTab";
import ModerationTab from "./tabs/ModerationTab";
import CareerIdeasTab from "./tabs/CareerIdeasTab";
import AgentsTab from "./tabs/AgentsTab";
import AnnouncementsTab from "./tabs/AnnouncementsTab";
import styles from "./admin.module.css";

export type Tab =
  | "overview" | "jobs" | "review" | "sources" | "members" | "communities"
  | "moderation" | "ideas" | "agents" | "announcements";

type Feedback = { kind: "ok" | "error"; text: string } | null;

export default function AdminClient({ data }: { data: AdminData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const onError = useCallback((text: string) => setFeedback(text ? { kind: "error", text } : null), []);
  const onSuccess = useCallback((text: string) => setFeedback(text ? { kind: "ok", text } : null), []);
  const actions = { onError, onSuccess, onChanged: refresh };

  // Success messages fade on their own; errors stay until closed or replaced.
  useEffect(() => {
    if (feedback?.kind !== "ok") return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  const { members, careerPaths, memberPaths } = data;
  const pathsByMember = useMemo(() => {
    const byId = new Map(careerPaths.map((c) => [c.id, c]));
    const m = new Map<string, CareerPath[]>();
    for (const l of memberPaths) {
      const cp = byId.get(l.career_path_id);
      if (cp) m.set(l.member_id, [...(m.get(l.member_id) ?? []), cp]);
    }
    return m;
  }, [memberPaths, careerPaths]);

  // Pending/rejected jobs (from the job finder) live in the Review queue, not the Jobs list.
  const listedJobs = data.jobs.filter((j) => j.review_status !== "pending" && j.review_status !== "rejected");
  const pendingJobs = data.jobs.filter((j) => j.review_status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rejectedJobs = data.jobs.filter((j) => j.review_status === "rejected").slice(0, 20);
  const heldCount = data.heldThreads.length + data.heldReplies.length;
  const moderationCount = heldCount + data.openReports.length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "jobs", label: `Jobs (${listedJobs.length})` },
    { key: "review", label: `Review queue (${pendingJobs.length})` },
    { key: "sources", label: "Job sources" },
    { key: "members", label: `Members (${members.length})` },
    { key: "communities", label: "Communities" },
    { key: "moderation", label: `Moderation (${moderationCount})` },
    { key: "announcements", label: `News & events (${data.announcements.length})` },
    { key: "ideas", label: `Career path ideas (${data.candidates.length})` },
    { key: "agents", label: "Assistants set-up" },
  ];

  function select(t: Tab, focus = false) {
    setTab(t);
    setFeedback(null);
    const el = tabRefs.current[t];
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (focus) el.focus();
    }
  }

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.key === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].key, true);
  }

  return (
    <div className="stack">
      <div className={`tabs ${styles.tabs}`} role="tablist" aria-label="Admin sections" onKeyDown={onTabKey}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} ref={(el) => { tabRefs.current[t.key] = el; }}
            aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1}
            onClick={() => select(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {pending && <p className="row small muted" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Updating…</p>}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === "overview" && (
          <OverviewTab
            jobs={data.jobs} members={members} careerPaths={careerPaths} memberPaths={memberPaths}
            queues={{
              pendingJobs: pendingJobs.length,
              heldPosts: heldCount,
              openReports: data.openReports.length,
              careerIdeas: data.candidates.length,
              sourceProblems: data.jobSources.filter((s) => s.is_active && (s.last_status === "error" || s.last_status === "blocked")).length,
              testAccounts: members.filter((m) => isTestAccount(m.email)).length,
            }}
            audit={data.audit} jobSources={data.jobSources}
            onGoTo={(t) => select(t, true)}
          />
        )}
        {tab === "jobs" && (
          <JobsTab jobs={listedJobs} careerPaths={careerPaths} jobSources={data.jobSources} adminId={data.adminId} {...actions} />
        )}
        {tab === "review" && (
          <ReviewQueueTab pending={pendingJobs} rejected={rejectedJobs} careerPaths={careerPaths} jobSources={data.jobSources}
            adminId={data.adminId} {...actions} />
        )}
        {tab === "sources" && <JobSourcesTab sources={data.jobSources} adminId={data.adminId} {...actions} />}
        {tab === "members" && <MembersTab members={members} careerPaths={careerPaths} pathsByMember={pathsByMember} adminId={data.adminId} {...actions} />}
        {tab === "communities" && (
          <CommunitiesTab communities={data.communities} communityMembers={data.communityMembers}
            communityOverview={data.communityOverview} members={members} adminId={data.adminId} {...actions} />
        )}
        {tab === "moderation" && (
          <ModerationTab heldThreads={data.heldThreads} heldReplies={data.heldReplies} openReports={data.openReports}
            relatedThreads={data.relatedThreads} relatedReplies={data.relatedReplies}
            communities={data.communities} members={members} {...actions} />
        )}
        {tab === "ideas" && <CareerIdeasTab candidates={data.candidates} careerPaths={careerPaths} adminId={data.adminId} {...actions} />}
        {tab === "agents" && <AgentsTab runs={data.agentRuns} />}
        {tab === "announcements" && <AnnouncementsTab announcements={data.announcements} adminId={data.adminId} {...actions} />}
      </div>

      {/* Always-present live region so screen readers announce every message. */}
      <div className={styles.feedbackRegion} aria-live="polite" aria-atomic="true">
        {feedback && (
          <div className={`${styles.feedback} ${feedback.kind === "error" ? styles.feedbackError : styles.feedbackOk}`}
            role={feedback.kind === "error" ? "alert" : undefined}>
            {feedback.kind === "error" ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
            <span className={styles.feedbackText}>{feedback.text}</span>
            <button type="button" className="icon-btn" onClick={() => setFeedback(null)} aria-label="Close message"><X size={18} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
