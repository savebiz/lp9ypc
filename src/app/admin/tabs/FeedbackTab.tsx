"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Wrench } from "lucide-react";
import type { Announcement, CareerPath, Community, Feedback, FeedbackKind, FeedbackStatus, Job, Profile } from "@/types";
import { formatDateTime, patchJson, type TabActions } from "./shared";
import styles from "../admin.module.css";

/** Wording from docs/phase-3-contracts.md (Phase 3.2 addendum). Use exactly. */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  link: "This link doesn't work",
  wrong_info: "Something here is wrong",
  broken: "Something's broken",
  idea: "I have an idea",
};
/** Admin list labels ("new" reads "Received" on the member side). */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  looking: "Looking into it",
  fixed: "Fixed",
  not_now: "Not now",
};

const isOpen = (f: Pick<Feedback, "status">) => f.status === "new" || f.status === "looking";
const targetKey = (f: Pick<Feedback, "target_type" | "target_id">) => (f.target_type && f.target_id ? `${f.target_type}:${f.target_id}` : "");

/**
 * Same-site path only. The database already requires a leading "/" and no
 * "//"; we also refuse backslashes, because browsers read "/\evil.com" as
 * another website.
 */
function safePath(p: string | null): string | null {
  return p && /^\/(?![/\\])[^\s\\]*$/.test(p) && p.length <= 300 ? p : null;
}

/** How many open member reports point at each item. */
export function openReportCounts(feedback: Feedback[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of feedback) {
    const k = targetKey(f);
    if (k && f.source === "member" && isOpen(f)) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export type FixTarget = { tab: "jobs" | "announcements"; id: string };

type StatusFilter = "open" | "all" | FeedbackStatus;

/** Member feedback and items found by the daily assistant. Updates go through PATCH /api/admin/feedback/[id]. */
export default function FeedbackTab({
  feedback, jobs, editableJobIds, announcements, careerPaths, communities, members, onFixIt, onError, onSuccess, onChanged,
}: TabActions & {
  feedback: Feedback[];
  jobs: Job[];
  /** Jobs that open in the Jobs editor (approved ones; pending jobs live in the Review queue). */
  editableJobIds: Set<string>;
  announcements: Announcement[];
  careerPaths: CareerPath[];
  communities: Community[];
  members: Profile[];
  onFixIt: (target: FixTarget) => void;
}) {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [kind, setKind] = useState<"all" | FeedbackKind>("all");
  const [assistantOnly, setAssistantOnly] = useState(false);

  const counts = useMemo(() => openReportCounts(feedback), [feedback]);
  const titles = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) m.set(`job:${j.id}`, `${j.title}${j.company ? ` at ${j.company}` : ""}`);
    for (const a of announcements) m.set(`announcement:${a.id}`, a.title);
    for (const c of careerPaths) m.set(`career_path:${c.id}`, c.name);
    for (const c of communities) m.set(`community:${c.id}`, c.name);
    return m;
  }, [jobs, announcements, careerPaths, communities]);
  const firstNames = useMemo(
    () => new Map(members.map((m) => [m.id, (m.full_name ?? "").trim().split(/\s+/)[0] || "A member"])),
    [members],
  );
  const announcementIds = useMemo(() => new Set(announcements.map((a) => a.id)), [announcements]);

  const shown = feedback
    .filter((f) => (status === "all" ? true : status === "open" ? isOpen(f) : f.status === status))
    .filter((f) => kind === "all" || f.kind === kind)
    .filter((f) => !assistantOnly || f.source === "assistant")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const newCount = feedback.filter((f) => f.status === "new").length;

  function fixTarget(f: Feedback): FixTarget | null {
    if (!f.target_id) return null;
    if (f.target_type === "job" && editableJobIds.has(f.target_id)) return { tab: "jobs", id: f.target_id };
    if (f.target_type === "announcement" && announcementIds.has(f.target_id)) return { tab: "announcements", id: f.target_id };
    return null;
  }

  return (
    <div className="stack">
      <div>
        <h2 className="title-sm">Feedback ({newCount} new)</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Problems and ideas sent by members, plus broken Apply links and out-of-date posts found by the daily assistant.
          Only admins see this list. The sender sees the status on their dashboard, and the reason if you choose Not now.
        </p>
      </div>

      <div className={styles.fbFilters}>
        <div className="field">
          <label className="label" htmlFor="fb-status">Show</label>
          <select id="fb-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="open">Still open (New and Looking into it)</option>
            <option value="new">New</option>
            <option value="looking">Looking into it</option>
            <option value="fixed">Fixed</option>
            <option value="not_now">Not now</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="fb-kind">Type</label>
          <select id="fb-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as "all" | FeedbackKind)}>
            <option value="all">All types</option>
            {(Object.keys(FEEDBACK_KIND_LABELS) as FeedbackKind[]).map((k) => (
              <option key={k} value={k}>{FEEDBACK_KIND_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <label className="check-row" htmlFor="fb-assistant">
          <input id="fb-assistant" type="checkbox" checked={assistantOnly} onChange={(e) => setAssistantOnly(e.target.checked)} />
          <span>Only show items found by the assistant</span>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          {feedback.length === 0 ? "No feedback yet. When members tell us about a problem or an idea, it appears here." : "Nothing matches these filters."}
        </div>
      ) : (
        <div className="list">
          {shown.map((f) => (
            <FeedbackRow
              key={f.id}
              item={f}
              title={titles.get(targetKey(f)) ?? null}
              sender={f.source === "member" && f.submitter_id ? firstNames.get(f.submitter_id) ?? "A member" : null}
              handler={f.handled_by ? firstNames.get(f.handled_by) ?? "an admin" : null}
              reports={counts.get(targetKey(f)) ?? 0}
              fix={fixTarget(f)}
              onFixIt={onFixIt}
              onError={onError} onSuccess={onSuccess} onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_SAVED: Record<FeedbackStatus, string> = {
  new: "Moved back to New.",
  looking: "Marked as Looking into it. The sender can see this on their dashboard.",
  fixed: "Marked as Fixed. The sender can see this on their dashboard.",
  not_now: "Marked as Not now. The sender can see the reason on their dashboard.",
};

function FeedbackRow({ item: f, title, sender, handler, reports, fix, onFixIt, onError, onSuccess, onChanged }: TabActions & {
  item: Feedback;
  title: string | null;
  sender: string | null;
  handler: string | null;
  reports: number;
  fix: FixTarget | null;
  onFixIt: (target: FixTarget) => void;
}) {
  const [busy, setBusy] = useState<"status" | "note" | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState(f.public_reason ?? "");
  const [note, setNote] = useState(f.admin_note ?? "");
  const path = safePath(f.page_path);
  const noteChanged = note.trim() !== (f.admin_note ?? "").trim();
  const ids = { reason: `fb-reason-${f.id}`, note: `fb-note-${f.id}` };

  async function save(body: { status?: FeedbackStatus; adminNote?: string | null; publicReason?: string | null }, what: "status" | "note") {
    setBusy(what); onError("");
    const res = await patchJson(`/api/admin/feedback/${f.id}`, body);
    setBusy(null);
    if (!res.ok) return onError(res.error);
    if (what === "note") onSuccess("Internal note saved.");
    else if (body.status) onSuccess(STATUS_SAVED[body.status]);
    setAskReason(false);
    onChanged();
  }

  function setStatus(s: FeedbackStatus) {
    if (s === "not_now") {
      setReason(f.public_reason ?? "");
      setAskReason(true);
      return;
    }
    void save({ status: s }, "status");
  }

  return (
    <article className={`card ${styles.reviewCard}${isOpen(f) ? "" : " dim"}`} aria-labelledby={`fb-h-${f.id}`}>
      <div className="row-wrap" style={{ gap: 8, marginBottom: 6 }}>
        <span className={`status ${f.status === "fixed" ? "ok" : f.status === "new" ? "admin" : "off"}`}>{FEEDBACK_STATUS_LABELS[f.status]}</span>
        {f.source === "assistant" && (
          <span className="status off"><Bot size={14} aria-hidden="true" style={{ marginRight: 4 }} />Found by the assistant</span>
        )}
        {reports >= 2 && <span className="status admin">{reports} reports</span>}
      </div>

      <h3 id={`fb-h-${f.id}`} className={styles.cardTitle}>{FEEDBACK_KIND_LABELS[f.kind] ?? "Feedback"}</h3>
      {title && <p className="small ink-2" style={{ marginTop: 2 }}>About: {title}</p>}

      {/* The note is shown as plain text only: never HTML, never turned into links. */}
      {f.message && <p className={styles.fbNote}>{f.message}</p>}

      <p className="small muted" style={{ marginTop: 6 }}>
        {sender ? `From ${sender}` : f.source === "assistant" ? "From the daily assistant" : "From a member (account since removed)"}
        {" · "}{formatDateTime(f.created_at)}
        {f.handled_at && f.status !== "new" ? ` · Updated by ${handler ?? "an admin"} on ${formatDateTime(f.handled_at)}` : ""}
      </p>
      {path && (
        <p className="small" style={{ marginTop: 4 }}>
          Page: <Link href={path} className={styles.inlineLink}>{path}</Link>
        </p>
      )}
      {f.status === "not_now" && f.public_reason && !askReason && (
        <p className="small ink-2" style={{ marginTop: 4 }}>Reason shown to the sender: {f.public_reason}</p>
      )}

      {fix && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-solid btn-sm" onClick={() => onFixIt(fix)}>
            <Wrench size={16} aria-hidden="true" /> Fix it now
          </button>
          <span className="hint" style={{ display: "block", marginTop: 4 }}>
            Opens the {fix.tab === "jobs" ? "job" : "post"} in its editor. Come back here afterwards to mark it Fixed.
          </span>
        </div>
      )}

      <div className={styles.fbStatusBtns} role="group" aria-label="Change status">
        {(["looking", "fixed", "not_now"] as const).map((s) => (
          <button key={s} type="button" className="btn btn-ghost btn-sm" aria-pressed={f.status === s}
            disabled={busy !== null || (f.status === s && s !== "not_now")} onClick={() => setStatus(s)}>
            {FEEDBACK_STATUS_LABELS[s]}
          </button>
        ))}
        {busy === "status" && <Loader2 size={18} className="spin" aria-label="Saving" />}
      </div>

      {askReason && (
        <form className={styles.fbReason} onSubmit={(e) => { e.preventDefault(); void save({ status: "not_now", publicReason: reason.trim() || null }, "status"); }}>
          <label className="label" htmlFor={ids.reason}>One-line reason for the sender <span className="opt">(optional)</span></label>
          <input id={ids.reason} className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We can't change this right now, but we've noted it." aria-describedby={`${ids.reason}-h`} autoFocus />
          <span className="hint" id={`${ids.reason}-h`}>The sender sees this on their dashboard. {200 - reason.length} characters left.</span>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-solid btn-sm" disabled={busy !== null}>
              {busy === "status" ? <><Loader2 size={16} className="spin" aria-hidden="true" /> Saving…</> : "Save as Not now"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskReason(false)} disabled={busy !== null}>Cancel</button>
          </div>
        </form>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label" htmlFor={ids.note}>Internal note <span className="opt">(only admins see this)</span></label>
        <textarea id={ids.note} className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          aria-describedby={`${ids.note}-h`} />
        <span className="hint" id={`${ids.note}-h`}>{1000 - note.length} characters left. Never shown to the sender.</span>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || !noteChanged}
            onClick={() => save({ adminNote: note.trim() || null }, "note")}>
            {busy === "note" ? <><Loader2 size={16} className="spin" aria-hidden="true" /> Saving…</> : "Save note"}
          </button>
        </div>
      </div>
    </article>
  );
}
