"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ENGAGEMENT_LABELS, LEVEL_LABELS, WORK_MODE_LABELS, formatDate, hostnameOf, isExpired, safeHttpUrl,
} from "@/lib/utils";
import type { CareerPath, Job, JobSource } from "@/types";
import JobEditor from "./JobEditor";
import { friendlyDbError, type TabActions } from "./shared";
import styles from "../admin.module.css";

/**
 * Jobs the job finder proposed (review_status = 'pending'). Nothing reaches
 * members until an admin approves it here.
 */
export default function ReviewQueueTab({ pending, rejected, careerPaths, jobSources, adminId, onError, onSuccess, onChanged }: TabActions & {
  pending: Job[]; rejected: Job[]; careerPaths: CareerPath[]; jobSources: JobSource[]; adminId: string;
}) {
  const [editing, setEditing] = useState<Job | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sourceName = new Map(jobSources.map((s) => [s.id, s.name]));

  async function approve(j: Job) {
    if (!safeHttpUrl(j.application_link)) {
      onError(`"${j.title}" has no working Apply link. Use Edit to add one, then approve.`);
      return;
    }
    setBusy(j.id); onError("");
    const { error } = await createClient().from("jobs").update({ review_status: "approved", is_active: true }).eq("id", j.id);
    setBusy(null);
    if (error) return onError(friendlyDbError("approve the job", error));
    onSuccess(`Approved — "${j.title}" is now live for members.`);
    onChanged();
  }

  async function reject(j: Job) {
    if (!confirm(`Reject "${j.title}"? It won't be shown to members.`)) return;
    setBusy(j.id); onError("");
    const { error } = await createClient().from("jobs").update({ review_status: "rejected", is_active: false }).eq("id", j.id);
    setBusy(null);
    if (error) return onError(friendlyDbError("reject the job", error));
    onSuccess(`Rejected "${j.title}".`);
    onChanged();
  }

  async function reconsider(j: Job) {
    setBusy(j.id); onError("");
    const { error } = await createClient().from("jobs").update({ review_status: "pending", is_active: false }).eq("id", j.id);
    setBusy(null);
    if (error) return onError(friendlyDbError("move the job back to review", error));
    onSuccess(`"${j.title}" is back in the review queue.`);
    onChanged();
  }

  return (
    <div className="stack">
      <div>
        <h2 className="title-sm">Review queue</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Jobs found by the job finder wait here. Check each one — especially the Apply link — then approve it to make it live, or reject it.
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
            onChanged();
          }}
        />
      )}

      {pending.length === 0 ? (
        <div className="empty">Nothing to review. New jobs from your job sources will appear here.</div>
      ) : (
        <div className="list">
          {pending.map((j) => {
            const applyHref = safeHttpUrl(j.application_link);
            const sourceHref = safeHttpUrl(j.source_page_url);
            const from = j.source_id ? sourceName.get(j.source_id) : undefined;
            const isBusy = busy === j.id;
            return (
              <article key={j.id} className={`card ${styles.reviewCard}`} aria-labelledby={`rq-${j.id}`}>
                <div className="row-wrap" style={{ gap: 8 }}>
                  <h3 id={`rq-${j.id}`} className={styles.cardTitle}>{j.title}</h3>
                  {isExpired(j.deadline) && <span className="status off">Deadline passed</span>}
                </div>
                <p className="ink-2" style={{ marginTop: 2 }}>{j.company}</p>

                <dl className={styles.facts}>
                  <div><dt>Location</dt><dd>{j.location || "—"}</dd></div>
                  <div><dt>Work mode</dt><dd>{j.work_mode ? WORK_MODE_LABELS[j.work_mode] : "—"}</dd></div>
                  <div><dt>Job type</dt><dd>{j.engagement_type ? ENGAGEMENT_LABELS[j.engagement_type] : "—"}</dd></div>
                  <div><dt>Level</dt><dd>{j.experience_level ? LEVEL_LABELS[j.experience_level] : "—"}</dd></div>
                  <div><dt>Career path</dt><dd>{j.career_paths?.name ?? "—"}</dd></div>
                  <div><dt>Deadline</dt><dd>{formatDate(j.deadline)}</dd></div>
                  <div><dt>Salary</dt><dd>{j.salary_range || "—"}</dd></div>
                  <div><dt>Found</dt><dd>{formatDate(j.created_at)}{from ? ` on ${from}` : ""}</dd></div>
                  <div>
                    <dt>Where we found it</dt>
                    <dd>
                      {sourceHref ? (
                        <a href={sourceHref} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                          {hostnameOf(sourceHref)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Apply link</dt>
                    <dd>
                      {applyHref ? (
                        <a href={applyHref} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                          {hostnameOf(applyHref)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : <span className={styles.warn}>Missing or invalid — edit before approving</span>}
                    </dd>
                  </div>
                </dl>

                {j.description && (
                  <details className={styles.details}>
                    <summary>Description</summary>
                    <p className="prose small">{j.description}</p>
                  </details>
                )}

                <div className="row-wrap" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn-solid btn-sm" onClick={() => approve(j)} disabled={!!busy}>
                    {isBusy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} Approve
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(j); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={!!busy}>
                    <Pencil size={16} aria-hidden="true" /> Edit
                  </button>
                  <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => reject(j)} disabled={!!busy}>
                    <X size={16} aria-hidden="true" /> Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejected.length > 0 && (
        <details className={styles.details}>
          <summary>Recently rejected ({rejected.length})</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {rejected.map((j) => (
              <div key={j.id} className="list-item dim">
                <div className="grow">
                  <strong>{j.title}</strong>
                  <p className="small muted">{j.company} · Found {formatDate(j.created_at)}</p>
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => reconsider(j)} disabled={!!busy}>
                    <RotateCcw size={16} aria-hidden="true" /> Review again
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
