"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, RotateCcw, Undo2, X } from "lucide-react";
import { formatDate, isExpired, safeHttpUrl, shortPathName } from "@/lib/utils";
import type { CareerPath, Job, JobRejectReason, JobSource } from "@/types";
import JobEditor from "./JobEditor";
import { postJson, type TabActions } from "./shared";
import {
  NO_FILTERS, PAGE_SIZE, REJECT_REASON_LABELS, ageLabel, applyLinkLooksOk, fetchJob, fetchRecentlyRejected, fetchReviewPage,
  hasReviewColumns, linkDomain, type ReviewFilters, type ReviewRow,
} from "./jobQueries";
import styles from "../admin.module.css";

const UNDO_MS = 8000;
const SCORE_OPTIONS = [0, 40, 60, 80];

type BulkAction = "approve" | "reject" | "restore";
interface BulkResult {
  ok: true;
  approved: string[];
  rejected: string[];
  restored: string[];
  skipped: { id: string; title: string; why: "no_link" | "not_pending" | "already_pending" | "not_found" }[];
  reasonSaved: boolean;
}
interface UndoState { text: string; ids: string[] }

const jobs = (n: number) => `${n} job${n === 1 ? "" : "s"}`;

/** Plain-English summary of jobs the server skipped. */
function skippedText(skipped: BulkResult["skipped"]): string {
  if (skipped.length === 0) return "";
  const noLink = skipped.filter((s) => s.why === "no_link").length;
  const other = skipped.length - noLink;
  const parts: string[] = [];
  if (noLink) parts.push(`${jobs(noLink)} skipped because the Apply link isn't a working web link (use Edit to fix it)`);
  if (other) parts.push(`${jobs(other)} skipped because someone else already dealt with ${other === 1 ? "it" : "them"}`);
  return ` ${parts.join("; ")}.`;
}

/**
 * Jobs the job finder proposed (review_status = 'pending'), 20 at a time from
 * the server. Nothing reaches members until an admin approves it here.
 * Bulk actions go through POST /api/admin/jobs/bulk and can be undone for 8 seconds.
 */
export default function ReviewQueueTab({ careerPaths, jobSources, adminId, onError, onSuccess, onChanged }: TabActions & {
  careerPaths: CareerPath[]; jobSources: JobSource[]; adminId: string;
}) {
  const [filters, setFilters] = useState<ReviewFilters>(NO_FILTERS);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [scored, setScored] = useState(hasReviewColumns());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [askReason, setAskReason] = useState(false);
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [barError, setBarError] = useState("");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [rejected, setRejected] = useState<ReviewRow[] | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const loadSeq = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const sourceName = new Map(jobSources.map((s) => [s.id, s.name]));
  // Sources and paths come from the database, so new ones appear here automatically.
  const sortedSources = [...jobSources].sort((a, b) => a.name.localeCompare(b.name));
  const sortedPaths = [...careerPaths].sort((a, b) => a.name.localeCompare(b.name));

  const load = useCallback(async (p: number, f: ReviewFilters) => {
    const seq = ++loadSeq.current;
    setLoading(true); setLoadError("");
    const res = await fetchReviewPage(p, f);
    if (seq !== loadSeq.current) return; // a newer request has started
    setLoading(false);
    if (!res.ok) { setLoadError(res.error); return; }
    setRows(res.rows);
    setTotal(res.total);
    setPage(res.page);
    setScored(res.scored ?? hasReviewColumns());
    // Keep only selections that are still on this page.
    setSelected((s) => new Set(res.rows.filter((r) => s.has(r.id)).map((r) => r.id)));
  }, []);

  useEffect(() => { void load(page, filters); }, [load, page, filters]);

  // The Undo offer disappears after about 8 seconds.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const loadRejected = useCallback(async () => {
    const res = await fetchRecentlyRejected();
    if (res.ok) setRejected(res.rows);
    else onError(res.error);
  }, [onError]);

  function changeFilters(next: Partial<ReviewFilters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(0);
    setSelected(new Set());
    setAskReason(false);
  }

  function goTo(p: number) {
    setSelected(new Set());
    setAskReason(false);
    setPage(p);
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedRows = rows.filter((r) => selected.has(r.id));
  // Same rule as the server: only a safe http(s) Apply link can be approved.
  const approvable = selectedRows.filter((r) => !!safeHttpUrl(r.application_link));
  const noLinkSelected = selectedRows.length - approvable.length;
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setBarError("");
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    if (n.size === 0) setAskReason(false);
    setSelected(n);
  }
  function toggleAll() {
    setBarError("");
    if (allOnPage) { setSelected(new Set()); setAskReason(false); }
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function bulk(action: BulkAction, ids: string[], reason?: JobRejectReason): Promise<BulkResult | null> {
    setBusy(action); setBarError(""); onError("");
    const res = await postJson<BulkResult>("/api/admin/jobs/bulk", { ids, action, ...(reason ? { reason } : {}) });
    setBusy(null);
    if (!res.ok) {
      if (action === "restore") onError(res.error); else setBarError(res.error);
      return null;
    }
    return res.data;
  }

  async function approveSelected() {
    const ids = approvable.map((r) => r.id);
    if (ids.length === 0) return;
    const r = await bulk("approve", ids);
    if (!r) return;
    finish(r.approved, `${jobs(r.approved.length)} approved and now live for members.`, r.skipped);
  }

  async function rejectSelected(reason: JobRejectReason) {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    const r = await bulk("reject", ids, reason);
    if (!r) return;
    const why = r.reasonSaved ? ` (${REJECT_REASON_LABELS[reason]})` : "";
    finish(r.rejected, `${jobs(r.rejected.length)} rejected${why}. Members won't see ${r.rejected.length === 1 ? "it" : "them"}.`, r.skipped);
  }

  function finish(changed: string[], text: string, skipped: BulkResult["skipped"]) {
    setSelected(new Set());
    setAskReason(false);
    if (changed.length > 0) setUndo({ text: `${text}${skippedText(skipped)}`, ids: changed });
    else setBarError(`Nothing changed.${skippedText(skipped)}`);
    void load(page, filters);
    if (rejectedOpen) void loadRejected();
    onChanged();
  }

  async function runUndo() {
    if (!undo) return;
    const { ids } = undo;
    setUndo(null);
    const r = await bulk("restore", ids);
    if (!r) return;
    onSuccess(`Undone. ${jobs(r.restored.length)} ${r.restored.length === 1 ? "is" : "are"} back in the review queue.`);
    void load(page, filters);
    if (rejectedOpen) void loadRejected();
    onChanged();
  }

  async function reviewAgain(row: ReviewRow) {
    const r = await bulk("restore", [row.id]);
    if (!r) return;
    if (r.restored.length === 0) return onError(`"${row.title}" was already moved. Refresh the page to see the latest.`);
    onSuccess(`"${row.title}" is back in the review queue.`);
    void load(page, filters);
    void loadRejected();
    onChanged();
  }

  async function openEditor(row: ReviewRow) {
    setOpening(row.id); onError("");
    const res = await fetchJob(row.id);
    setOpening(null);
    if (!res.ok) return onError(res.error);
    setEditing(res.job);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filtered = filters.source || filters.path || filters.minScore > 0 || filters.linkOk;

  return (
    <div className="stack">
      <div>
        <h2 className="title-sm" ref={headingRef} style={{ scrollMarginTop: 16 }}>Review queue</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Jobs found by the job finder wait here. Tick the ones that look right and approve them together, or reject the ones members can&apos;t use.
          You can undo either for a few seconds afterwards.
        </p>
      </div>

      {editing && (
        <JobEditor
          key={editing.id}
          job={editing}
          careerPaths={careerPaths}
          adminId={adminId}
          approveOnSave
          onError={onError}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            onSuccess(`Saved and approved — "${editing.title}" is now live for members.`);
            setEditing(null);
            void load(page, filters);
            onChanged();
          }}
        />
      )}

      <div className={styles.rqFilters}>
        <div className="field">
          <label className="label" htmlFor="rq-source">Source</label>
          <select id="rq-source" className="input" value={filters.source} onChange={(e) => changeFilters({ source: e.target.value })}>
            <option value="">All sources</option>
            {sortedSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="rq-path">Career path</label>
          <select id="rq-path" className="input" value={filters.path} onChange={(e) => changeFilters({ path: e.target.value })}>
            <option value="">All career paths</option>
            <option value="none">No career path yet</option>
            {sortedPaths.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="rq-score">Minimum score</label>
          <select id="rq-score" className="input" value={filters.minScore} disabled={!scored}
            aria-describedby={scored ? undefined : "rq-score-h"}
            onChange={(e) => changeFilters({ minScore: Number(e.target.value) })}>
            {SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n === 0 ? "Any score" : `${n} or more`}</option>)}
          </select>
          {!scored && <span className="hint" id="rq-score-h">Scores aren&apos;t switched on yet, so the newest jobs come first.</span>}
        </div>
        <label className="check-row" htmlFor="rq-linkok">
          <input id="rq-linkok" type="checkbox" checked={filters.linkOk} onChange={(e) => changeFilters({ linkOk: e.target.checked })} />
          <span>
            Apply link looks OK
            <span className="hint" style={{ display: "block", marginTop: 2 }}>Hides jobs whose link only goes to a website&apos;s home page.</span>
          </span>
        </label>
      </div>

      <div className="spread" style={{ flexWrap: "wrap", gap: 8 }}>
        <p className="small ink-2" role="status" aria-live="polite">
          {loading ? "Loading…" : total === 0 ? "" : `${total} waiting${filtered ? " (filtered)" : ""}${scored ? " · best score first" : " · newest first"}`}
        </p>
        {filtered && <button type="button" className="btn btn-link" onClick={() => changeFilters(NO_FILTERS)}>Clear filters</button>}
      </div>

      {loadError ? (
        <div className="alert alert-error" role="alert">
          {loadError}{" "}
          <button type="button" className="btn btn-link" onClick={() => void load(page, filters)}>Try again</button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="empty">
          {filtered ? "No waiting jobs match these filters." : "Nothing to review. New jobs from your job sources will appear here."}
        </div>
      ) : (
        <>
          <label className={`check-row ${styles.rqSelectAll}`} htmlFor="rq-all">
            <input id="rq-all" type="checkbox" checked={allOnPage} onChange={toggleAll} disabled={loading || rows.length === 0} />
            <span>Select all on this page ({rows.length})</span>
          </label>

          <ul className={styles.rqList} aria-busy={loading}>
            {rows.map((r) => (
              <QueueRow key={r.id} row={r} source={r.source_id ? sourceName.get(r.source_id) : undefined}
                checked={selected.has(r.id)} onToggle={() => toggle(r.id)}
                onEdit={() => openEditor(r)} opening={opening === r.id} disabled={!!busy} />
            ))}
          </ul>

          {pages > 1 && (
            <nav className={styles.pager} aria-label="Review queue pages">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(page - 1)} disabled={page === 0 || loading}>
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>
              <span className="small ink-2">Page {page + 1} of {pages}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(page + 1)} disabled={page + 1 >= pages || loading}>
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}

      <details className={styles.details} onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        setRejectedOpen(open);
        if (open && rejected === null) void loadRejected();
      }}>
        <summary>Recently rejected</summary>
        {rejected === null ? (
          <p className="small muted row" style={{ marginTop: 8 }}><Loader2 size={16} className="spin" aria-hidden="true" /> Loading…</p>
        ) : rejected.length === 0 ? (
          <p className="small muted" style={{ marginTop: 8 }}>No rejected jobs.</p>
        ) : (
          <div className="list" style={{ marginTop: 10 }}>
            {rejected.map((j) => (
              <div key={j.id} className="list-item dim">
                <div className="grow">
                  <strong>{j.title}</strong>
                  <p className="small muted">
                    {j.company}
                    {j.reject_reason ? ` · ${REJECT_REASON_LABELS[j.reject_reason] ?? "Other"}` : ""}
                    {` · ${j.reviewed_at ? `Rejected ${formatDate(j.reviewed_at)}` : `Found ${formatDate(j.created_at)}`}`}
                  </p>
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => reviewAgain(j)} disabled={!!busy}>
                    <RotateCcw size={16} aria-hidden="true" /> Review again
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>

      {/* Sticky at the bottom of the screen: the selection bar and the Undo offer. */}
      {(selected.size > 0 || undo || barError) && (
        <div className={styles.dock}>
          {undo && selected.size === 0 && (
            <div className={styles.dockUndo} role="status">
              <span className={styles.dockText}>{undo.text}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={runUndo} disabled={!!busy}>
                <Undo2 size={16} aria-hidden="true" /> Undo
              </button>
            </div>
          )}

          {barError && (
            <div className={styles.dockError} role="alert">
              <span className={styles.dockText}>{barError}</span>
              <button type="button" className="icon-btn" onClick={() => setBarError("")} aria-label="Close message"><X size={18} /></button>
            </div>
          )}

          {selected.size > 0 && (
            <div className={styles.dockBar} role="region" aria-label="Selected jobs">
              <div className="spread" style={{ gap: 8 }}>
                <span className="small" style={{ fontWeight: 600 }}>{jobs(selected.size)} selected</span>
                <button type="button" className="btn btn-link" onClick={() => { setSelected(new Set()); setAskReason(false); }}>Clear</button>
              </div>
              {noLinkSelected > 0 && (
                <p className="small ink-2">
                  {noLinkSelected === 1 ? "1 selected job has" : `${noLinkSelected} selected jobs have`} no working Apply link, so
                  {noLinkSelected === 1 ? " it" : " they"} can only be rejected. Use Edit to fix the link first.
                </p>
              )}
              {!askReason ? (
                <div className={styles.dockBtns}>
                  <button type="button" className="btn btn-solid btn-sm" onClick={approveSelected} disabled={!!busy || approvable.length === 0}>
                    {busy === "approve" ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    Approve selected ({approvable.length})
                  </button>
                  <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => setAskReason(true)} disabled={!!busy}>
                    <X size={16} aria-hidden="true" /> Reject selected ({selected.size})
                  </button>
                </div>
              ) : (
                <fieldset className={styles.reasonSet} disabled={!!busy}>
                  <legend className="small" style={{ fontWeight: 600 }}>
                    Why reject {selected.size === 1 ? "this job" : `these ${selected.size} jobs`}? Tap a reason.
                  </legend>
                  <div className={styles.reasonGrid}>
                    {(Object.keys(REJECT_REASON_LABELS) as JobRejectReason[]).map((k) => (
                      <button key={k} type="button" className="chip-btn" onClick={() => rejectSelected(k)}>
                        {REJECT_REASON_LABELS[k]}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-link" onClick={() => setAskReason(false)}>
                    {busy === "reject" ? <><Loader2 size={16} className="spin" aria-hidden="true" /> Rejecting…</> : "Cancel"}
                  </button>
                </fieldset>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function scoreBadge(score: number | null): { text: string; cls: string } {
  if (score === null) return { text: "No score", cls: "off" };
  if (score >= 70) return { text: `Score ${score} · strong`, cls: "ok" };
  if (score >= 40) return { text: `Score ${score}`, cls: "admin" };
  return { text: `Score ${score} · weak`, cls: "off" };
}

function QueueRow({ row: r, source, checked, onToggle, onEdit, opening, disabled }: {
  row: ReviewRow; source?: string; checked: boolean; onToggle: () => void; onEdit: () => void; opening: boolean; disabled: boolean;
}) {
  const domain = linkDomain(r.application_link);
  const homeOnly = !!domain && !applyLinkLooksOk(r.application_link);
  const badge = scoreBadge(r.relevance);
  const titleId = `rq-t-${r.id}`;
  return (
    <li className={`${styles.rqRow}${checked ? ` ${styles.rqRowOn}` : ""}`}>
      <label className={styles.rqCheck}>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-labelledby={titleId} />
      </label>
      <div className={styles.rqMain}>
        <p id={titleId} className={styles.rqTitle}>{r.title}</p>
        <p className="small ink-2">{r.company}{r.location ? ` · ${r.location}` : ""}</p>
        <div className={styles.rqMeta}>
          <span className={`status ${badge.cls}`}>{badge.text}</span>
          <span className="chip">{r.career_paths ? shortPathName(r.career_paths.name) : "No career path"}</span>
          {isExpired(r.deadline) && <span className="status off">Deadline passed</span>}
        </div>
        <p className="small muted">
          {source ? `${source} · ` : ""}found {ageLabel(r.created_at) === "today" ? "today" : `${ageLabel(r.created_at)} ago`}
        </p>
        <div className={styles.rqActions}>
          {domain ? (
            <a href={safeHttpUrl(r.application_link) ?? undefined} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
              {domain} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (check the Apply link, opens in a new tab)</span>
            </a>
          ) : <span className={styles.warn}>No working Apply link</span>}
          {homeOnly && <span className={`small ${styles.warn}`}>Goes to a home page</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} disabled={disabled || opening}
            aria-label={`Edit, then approve: ${r.title}`}>
            {opening ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />} Edit, then approve
          </button>
        </div>
      </div>
    </li>
  );
}

