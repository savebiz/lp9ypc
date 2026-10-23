"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../admin.module.css";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ENGAGEMENT_LABELS, WORK_MODE_LABELS, formatDate, hostnameOf, isExpired, shortPathName } from "@/lib/utils";
import type { CareerPath, Job, JobSource } from "@/types";
import JobEditor from "./JobEditor";
import { writeProblem, type TabActions } from "./shared";
import { PAGE_SIZE, fetchJob, fetchListedPage, type ListedRow } from "./jobQueries";

/**
 * Approved jobs (live and archived), 20 at a time from the server.
 * Pending/rejected ones live in the Review queue.
 */
export default function JobsTab({ careerPaths, jobSources, adminId, editId, onError, onSuccess, onChanged }: TabActions & {
  careerPaths: CareerPath[]; jobSources: JobSource[]; adminId: string;
  /** Open this job in the editor straight away ("Fix it now" on the Feedback and Overview tabs). */
  editId?: string | null;
}) {
  const [editing, setEditing] = useState<Job | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [opening, setOpening] = useState<string | null>(editId ?? null);
  const [rows, setRows] = useState<ListedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadSeq = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sourceName = new Map(jobSources.map((s) => [s.id, s.name]));

  const load = useCallback(async (p: number, q: string) => {
    const seq = ++loadSeq.current;
    setLoading(true); setLoadError("");
    const res = await fetchListedPage(p, q);
    if (seq !== loadSeq.current) return;
    setLoading(false);
    if (!res.ok) { setLoadError(res.error); return; }
    setRows(res.rows); setTotal(res.total); setPage(res.page);
  }, []);

  useEffect(() => { void load(page, query); }, [load, page, query]);

  // "Fix it now": fetch that one job and open it in the editor.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchJob(editId).then((res) => {
      if (cancelled) return;
      setOpening(null);
      if (!res.ok) return onError(res.error);
      setEditing(res.job); setShowForm(true);
    });
    return () => { cancelled = true; };
  }, [editId, onError]);

  function openNew() {
    setEditing(null); setShowForm(true);
  }
  async function openEdit(j: ListedRow) {
    setOpening(j.id); onError("");
    const res = await fetchJob(j.id);
    setOpening(null);
    if (!res.ok) return onError(res.error);
    setEditing(res.job); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function refresh() {
    void load(page, query);
    onChanged();
  }

  async function toggleActive(j: ListedRow) {
    onError("");
    const problem = writeProblem(j.is_active ? "archive the job" : "restore the job",
      await createClient().from("jobs").update({ is_active: !j.is_active }).eq("id", j.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(j.is_active ? `"${j.title}" is archived and hidden from members.` : `"${j.title}" is live again.`);
    refresh();
  }

  async function remove(j: ListedRow) {
    if (!confirm(`Delete "${j.title}" permanently? Members who saved it will lose it. Archiving hides it instead and can be undone.`)) return;
    onError("");
    const problem = writeProblem("delete the job", await createClient().from("jobs").delete().eq("id", j.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(`"${j.title}" was deleted.`);
    refresh();
  }

  function goTo(p: number) {
    setPage(p);
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-sm" ref={headingRef} style={{ scrollMarginTop: 16 }}>Job listings</h2>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> Post a job</button>}
      </div>

      {opening && opening === editId && !showForm && (
        <p className="row small muted" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Opening the job…</p>
      )}

      {showForm && (
        <JobEditor
          key={editing?.id ?? "new"}
          job={editing}
          careerPaths={careerPaths}
          adminId={adminId}
          onError={onError}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => {
            onSuccess(editing ? "Job saved." : "Job posted. Members can see it now.");
            setShowForm(false); setEditing(null);
            refresh();
          }}
        />
      )}

      <form className={styles.jobSearch} role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(search.trim()); }}>
        <div className="field">
          <label className="label" htmlFor="jobs-q">Search by job title or organisation</label>
          <input id="jobs-q" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} />
        </div>
        <button type="submit" className="btn btn-ghost btn-sm" style={{ marginBottom: 2 }}><Search size={16} aria-hidden="true" /> Search</button>
        {query && (
          <button type="button" className="btn btn-link" onClick={() => { setSearch(""); setQuery(""); setPage(0); }}>Show all</button>
        )}
      </form>

      <p className="small ink-2" role="status" aria-live="polite">
        {loading ? "Loading…" : `${total} job${total === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}`}
      </p>

      {loadError ? (
        <div className="alert alert-error" role="alert">
          {loadError}{" "}
          <button type="button" className="btn btn-link" onClick={() => void load(page, query)}>Try again</button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="empty">
          {query ? "No jobs match that search." : <>No jobs yet. Use <strong>Post a job</strong> to add the first one.</>}
        </div>
      ) : (
        <div className="list" aria-busy={loading}>
          {rows.map((j) => {
            const expired = isExpired(j.deadline);
            const scraped = !!(j.source_id || j.source_page_url);
            const fromName = j.source_id ? sourceName.get(j.source_id) : undefined;
            return (
              <div key={j.id} className={`list-item${j.is_active ? "" : " dim"}`}>
                <div className="grow">
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <strong>{j.title}</strong>
                    <span className={`status ${j.is_active && !expired ? "ok" : "off"}`}>
                      {!j.is_active ? "Archived" : expired ? "Deadline passed" : "Live"}
                    </span>
                  </div>
                  <p className="small ink-2" style={{ marginTop: 2 }}>
                    {j.company}
                    {j.work_mode ? ` · ${WORK_MODE_LABELS[j.work_mode]}` : ""}
                    {j.engagement_type ? ` · ${ENGAGEMENT_LABELS[j.engagement_type]}` : ""}
                    {j.career_paths ? ` · ${shortPathName(j.career_paths.name)}` : ""}
                  </p>
                  <p className="small muted" style={{ marginTop: 2 }}>
                    Deadline {formatDate(j.deadline)} · Posted {formatDate(j.created_at)} · Apply → {hostnameOf(j.application_link) || "invalid link"}
                  </p>
                  {scraped && (
                    <p className="small muted" style={{ marginTop: 2 }}>
                      Found by the job finder{fromName ? ` on ${fromName}` : ""}
                    </p>
                  )}
                </div>
                <div className="actions">
                  <Link href={`/jobs/${j.id}`} className="btn btn-ghost btn-sm" aria-label={`View ${j.title}`}><ExternalLink size={16} aria-hidden="true" /> View</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(j)} disabled={opening === j.id} aria-label={`Edit ${j.title}`}>
                    {opening === j.id ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />} Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(j)} aria-label={`${j.is_active ? "Archive (hide)" : "Restore"} ${j.title}`}>
                    {j.is_active ? <Archive size={16} aria-hidden="true" /> : <ArchiveRestore size={16} aria-hidden="true" />} {j.is_active ? "Archive" : "Restore"}
                  </button>
                  <button className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => remove(j)} aria-label={`Delete ${j.title}`}><Trash2 size={16} aria-hidden="true" /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label="Job list pages">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(page - 1)} disabled={page === 0 || loading}>
            <ChevronLeft size={16} aria-hidden="true" /> Previous
          </button>
          <span className="small ink-2">Page {page + 1} of {pages}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(page + 1)} disabled={page + 1 >= pages || loading}>
            Next <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
