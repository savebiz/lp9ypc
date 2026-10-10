"use client";

import { useState } from "react";
import { ExternalLink, Lightbulb, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hostnameOf, safeHttpUrl } from "@/lib/utils";
import type { JobSource } from "@/types";
import { SUGGESTED_SOURCES } from "@/lib/agents/suggested-sources";
import { FieldError, formatDateTime, friendlyDbError, plainSourceError, postJson, writeProblem, type TabActions } from "./shared";
import styles from "../admin.module.css";

const STATUS_LABELS: Record<NonNullable<JobSource["last_status"]>, { text: string; cls: string }> = {
  ok: { text: "Worked", cls: "ok" },
  empty: { text: "No jobs found", cls: "off" },
  blocked: { text: "Site blocked us", cls: "off" },
  error: { text: "Error", cls: "off" },
};

interface SourceForm { name: string; url: string; notes: string; is_active: boolean }
const EMPTY: SourceForm = { name: "", url: "", notes: "", is_active: true };

/** Shape of SUGGESTED_SOURCES (src/lib/agents/suggested-sources.ts, docs/phase-3-contracts.md). */
interface SuggestedSource { name: string; url: string; why: string; method: "structured" | "ai" }

interface RunResult { status: "ok" | "empty" | "blocked" | "error"; found: number; inserted: number; message: string }

/** Websites the job finder checks daily. New jobs land in the Review queue. */
export default function JobSourcesTab({ sources, adminId, onError, onSuccess, onChanged }: TabActions & {
  sources: JobSource[]; adminId: string;
}) {
  const [editing, setEditing] = useState<JobSource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SourceForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof SourceForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const knownUrls = new Set(sources.map((s) => normaliseUrl(s.url)));
  const suggestions = (SUGGESTED_SOURCES as SuggestedSource[]).filter((s: SuggestedSource) => !knownUrls.has(normaliseUrl(s.url)));

  function openNew() {
    setEditing(null); setForm(EMPTY); setErrors({}); setShowForm(true);
  }
  function openEdit(s: JobSource) {
    setEditing(s);
    setForm({ name: s.name, url: s.url, notes: s.notes ?? "", is_active: s.is_active });
    setErrors({}); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function set<K extends keyof SourceForm>(k: K, v: SourceForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof SourceForm, string>> = {};
    const url = safeHttpUrl(form.url);
    if (!form.name.trim()) errs.name = "Give the source a name, e.g. “Jobberman — Lagos finance jobs”";
    if (!url) errs.url = "Paste the full web address, starting with https://";
    else if (url.length > 2000) errs.url = "That web address is too long";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`s-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    setSaving(true); onError("");
    const supabase = createClient();
    const payload = { name: form.name.trim().slice(0, 120), url: url!, notes: form.notes.trim() || null, is_active: form.is_active };
    const res = editing
      ? await supabase.from("job_sources").update(payload).eq("id", editing.id).select("id")
      : await supabase.from("job_sources").insert({ ...payload, created_by: adminId || null }).select("id");
    setSaving(false);
    if (res.error?.code === "23505") return onError("That web address is already in your list of job sources.");
    const problem = writeProblem("save the job source", res);
    if (problem) return onError(problem);
    onSuccess(editing ? "Job source saved." : "Job source added. The job finder will check it on its next daily run, or use Run now.");
    setShowForm(false); setEditing(null);
    onChanged();
  }

  async function remove(s: JobSource) {
    if (!confirm(`Remove "${s.name}" from your job sources? Jobs already found from it stay where they are.`)) return;
    onError("");
    const problem = writeProblem("remove the job source", await createClient().from("job_sources").delete().eq("id", s.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(`Removed "${s.name}".`);
    onChanged();
  }

  async function addSuggested(s: SuggestedSource) {
    const url = safeHttpUrl(s.url);
    if (!url) return onError(`"${s.name}" doesn't have a usable web address.`);
    setAdding(s.url); onError("");
    const { error } = await createClient().from("job_sources").insert({
      name: s.name.slice(0, 120), url, notes: s.why.slice(0, 1000) || null, is_active: true, created_by: adminId || null,
    });
    setAdding(null);
    if (error?.code === "23505") return onError(`"${s.name}" is already in your list of job sources.`);
    if (error) return onError(friendlyDbError("add the job source", error));
    onSuccess(`Added "${s.name}". The job finder will check it on its next daily run, or use Run now.`);
    onChanged();
  }

  async function runNow(s: JobSource) {
    setRunning(s.id); onError("");
    const res = await postJson<RunResult & { ok: true }>(`/api/admin/job-sources/${encodeURIComponent(s.id)}/run`, {});
    setRunning(null);
    if (!res.ok) {
      onError(`Couldn't check "${s.name}": ${res.error}`);
    } else {
      const d = res.data;
      const summary = d.message || `Found ${d.found} job${d.found === 1 ? "" : "s"}, ${d.inserted} new.`;
      if (d.status === "ok" || d.status === "empty") {
        onSuccess(`${s.name}: ${summary}${d.inserted > 0 ? " New jobs are waiting in the Review queue." : ""}`);
      } else {
        onError(`${s.name}: ${summary}`);
      }
    }
    onChanged();
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h2 className="title-sm">Job sources</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Websites the job finder checks once a day (about 7:00am Lagos time). Jobs it finds wait in the Review queue until you approve them.
          </p>
        </div>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> Add a source</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <h3 className="title-sm" style={{ marginBottom: 16 }}>{editing ? "Edit job source" : "Add a job source"}</h3>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="s-name">Name</label>
              <input id="s-name" className="input" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)}
                aria-invalid={!!errors.name} aria-describedby={errors.name ? "se-name" : undefined} />
              {errors.name && <FieldError id="se-name" msg={errors.name} />}
            </div>
            <div className="field">
              <label className="label" htmlFor="s-url">Web address of the jobs page</label>
              <input id="s-url" className="input" type="url" inputMode="url" maxLength={2000} placeholder="https://" value={form.url}
                onChange={(e) => set("url", e.target.value)} aria-invalid={!!errors.url}
                aria-describedby={`sh-url${errors.url ? " se-url" : ""}`} />
              <span className="hint" id="sh-url">Use the page that lists the jobs, not the site&apos;s home page.</span>
              {errors.url && <FieldError id="se-url" msg={errors.url} />}
            </div>
            <div className="field full">
              <label className="label" htmlFor="s-notes">Notes <span className="opt">(optional)</span></label>
              <textarea id="s-notes" className="input" maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. Good for graduate trainee roles in banks." />
            </div>
            <div className="field full">
              <label className="check-row">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
                <span>
                  <strong>Active</strong>
                  <span className="hint" style={{ display: "block", marginTop: 2 }}>The job finder only checks active sources.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : editing ? "Save changes" : "Add source"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {sources.length === 0 ? (
        <div className="empty">No job sources yet. Add a jobs page (for example a company careers page) and the job finder will check it daily.</div>
      ) : (
        <div className="list">
          {sources.map((s) => {
            const status = s.last_status ? STATUS_LABELS[s.last_status] : null;
            const href = safeHttpUrl(s.url);
            const isRunning = running === s.id;
            return (
              <div key={s.id} className={`list-item ${styles.stackOnMobile}${s.is_active ? "" : " dim"}`}>
                <div className="grow">
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <strong>{s.name}</strong>
                    <span className={`status ${s.is_active ? "ok" : "off"}`}>{s.is_active ? "Active" : "Paused"}</span>
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={`small ${styles.inlineLink}`}>
                      {hostnameOf(href)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                  {s.notes && <p className="small ink-2" style={{ marginTop: 2 }}>{s.notes}</p>}
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {s.last_run_at ? (
                      <>
                        Last checked {formatDateTime(s.last_run_at)}
                        {status && <> · <span className={`status ${status.cls}`}>{status.text}</span></>}
                        {" · "}{s.jobs_found} job{s.jobs_found === 1 ? "" : "s"} found
                      </>
                    ) : "Not checked yet"}
                  </p>
                  <SourceProblem source={s} />
                  {isRunning && (
                    <p className="small ink-2 row" role="status" style={{ marginTop: 6, gap: 6 }}>
                      <Loader2 size={14} className="spin" aria-hidden="true" /> Checking the site — this can take up to a minute…
                    </p>
                  )}
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => runNow(s)} disabled={!!running}
                    aria-label={`Run the job finder on ${s.name} now`}>
                    {isRunning ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} Run now
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil size={16} aria-hidden="true" /> Edit</button>
                  <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => remove(s)} aria-label={`Remove ${s.name}`}><Trash2 size={16} aria-hidden="true" /> Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="stack" aria-labelledby="suggested-h">
        <div>
          <h2 id="suggested-h" className="title-sm row" style={{ gap: 8 }}><Lightbulb size={20} aria-hidden="true" /> Suggested sources</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Job pages we&apos;ve checked: the site allows us to read them and they loaded when we tried. Add the ones that suit the club.
          </p>
        </div>
        {suggestions.length === 0 ? (
          <div className="empty">
            {SUGGESTED_SOURCES.length === 0 ? "No suggestions yet." : "You've added every suggested source."}
          </div>
        ) : (
          <div className="list">
            {suggestions.map((s: SuggestedSource) => {
              const href = safeHttpUrl(s.url);
              return (
                <div key={s.url} className={`list-item ${styles.stackOnMobile}`}>
                  <div className="grow">
                    <div className="row-wrap" style={{ gap: 8 }}>
                      <strong>{s.name}</strong>
                      <span className="status off">{s.method === "structured" ? "Reads the site's job data" : "Uses the AI reader"}</span>
                    </div>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className={`small ${styles.inlineLink}`}>
                        {hostnameOf(href)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                    <p className="small ink-2" style={{ marginTop: 2 }}>{s.why}</p>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSuggested(s)} disabled={!!adding || !href}
                      aria-label={`Add ${s.name} as a job source`}>
                      {adding === s.url ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Add this source
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Compare web addresses ignoring case, a trailing slash and http vs https. */
function normaliseUrl(u: string): string {
  return u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** The last problem in plain English, with the technical text tucked away for the tech team. */
function SourceProblem({ source }: { source: JobSource }) {
  const problem = plainSourceError(source.last_status, source.last_error);
  if (!problem) return null;
  return (
    <div style={{ marginTop: 2 }}>
      <p className={`small ${styles.warn}`}>Last problem: {problem.text}</p>
      {problem.technical && (
        <details className={styles.details} style={{ marginTop: 0 }}>
          <summary className="small">Details for the tech team</summary>
          <p className="small muted" style={{ overflowWrap: "anywhere" }}>{problem.technical}</p>
        </details>
      )}
    </div>
  );
}
