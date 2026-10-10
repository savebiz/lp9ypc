"use client";

import { useState } from "react";
import styles from "../admin.module.css";
import Link from "next/link";
import { Archive, ArchiveRestore, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ENGAGEMENT_LABELS, WORK_MODE_LABELS, formatDate, hostnameOf, isExpired, shortPathName } from "@/lib/utils";
import type { CareerPath, Job, JobSource } from "@/types";
import JobEditor from "./JobEditor";
import { writeProblem, type TabActions } from "./shared";

/** Approved jobs (and jobs from before the review queue existed). Pending/rejected ones live in the Review queue. */
export default function JobsTab({ jobs, careerPaths, jobSources, adminId, editId, onError, onSuccess, onChanged }: TabActions & {
  jobs: Job[]; careerPaths: CareerPath[]; jobSources: JobSource[]; adminId: string;
  /** Open this job in the editor straight away ("Fix it now" on the Feedback tab). */
  editId?: string | null;
}) {
  const [editing, setEditing] = useState<Job | null>(() => (editId ? jobs.find((j) => j.id === editId) ?? null : null));
  const [showForm, setShowForm] = useState(() => !!editId && jobs.some((j) => j.id === editId));
  const sourceName = new Map(jobSources.map((s) => [s.id, s.name]));

  function openNew() {
    setEditing(null); setShowForm(true);
  }
  function openEdit(j: Job) {
    setEditing(j); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleActive(j: Job) {
    onError("");
    const problem = writeProblem(j.is_active ? "archive the job" : "restore the job",
      await createClient().from("jobs").update({ is_active: !j.is_active }).eq("id", j.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(j.is_active ? `"${j.title}" is archived and hidden from members.` : `"${j.title}" is live again.`);
    onChanged();
  }

  async function remove(j: Job) {
    if (!confirm(`Delete "${j.title}" permanently? Members who saved it will lose it. Archiving hides it instead and can be undone.`)) return;
    onError("");
    const problem = writeProblem("delete the job", await createClient().from("jobs").delete().eq("id", j.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(`"${j.title}" was deleted.`);
    onChanged();
  }

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-sm">Job listings</h2>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> Post a job</button>}
      </div>

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
            onChanged();
          }}
        />
      )}

      {jobs.length === 0 ? (
        <div className="empty">No jobs yet. Use <strong>Post a job</strong> to add the first one.</div>
      ) : (
        <div className="list">
          {jobs.map((j) => {
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
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(j)} aria-label={`Edit ${j.title}`}><Pencil size={16} aria-hidden="true" /> Edit</button>
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
    </div>
  );
}
