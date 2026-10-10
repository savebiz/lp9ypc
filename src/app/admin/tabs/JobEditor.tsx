"use client";

import { useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ENGAGEMENT_LABELS, LEVEL_LABELS, WORK_MODE_LABELS, safeHttpUrl } from "@/lib/utils";
import type { CareerPath, Job } from "@/types";
import { friendlyDbError, writeProblem } from "./shared";

export const EMPTY_JOB = {
  title: "", company: "", location: "", work_mode: "", engagement_type: "", experience_level: "",
  deadline: "", description: "", career_path_id: "", application_link: "", salary_range: "",
};
export type JobForm = typeof EMPTY_JOB;

function jobToForm(j: Job): JobForm {
  return {
    title: j.title, company: j.company, location: j.location ?? "", work_mode: j.work_mode ?? "",
    engagement_type: j.engagement_type ?? "", experience_level: j.experience_level ?? "", deadline: j.deadline ?? "",
    description: j.description ?? "", career_path_id: j.career_path_id ?? "", application_link: j.application_link,
    salary_range: j.salary_range ?? "",
  };
}

/**
 * The job form, used by the Jobs tab (post / edit) and the Review queue
 * (edit, then approve). Every saved job must have a working Apply link.
 */
export default function JobEditor({ job, careerPaths, adminId, approveOnSave = false, onSaved, onCancel, onError }: {
  job: Job | null;
  careerPaths: CareerPath[];
  adminId: string;
  /** Review queue: saving also approves the job and makes it live. */
  approveOnSave?: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState<JobForm>(job ? jobToForm(job) : EMPTY_JOB);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof JobForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof JobForm, v: string) => { setForm((f) => ({ ...f, [k]: v })); setFormErrors((e) => ({ ...e, [k]: undefined })); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof JobForm, string>> = {};
    if (!form.title.trim()) errs.title = "Required";
    if (!form.company.trim()) errs.company = "Required";
    if (!safeHttpUrl(form.application_link)) errs.application_link = "Paste the full link, starting with https://";
    setFormErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`j-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    setSaving(true); onError("");
    const supabase = createClient();
    const payload = {
      ...form,
      title: form.title.trim(),
      company: form.company.trim(),
      location: form.location.trim() || null,
      salary_range: form.salary_range.trim() || null,
      description: form.description.trim() || null,
      application_link: safeHttpUrl(form.application_link)!,
      deadline: form.deadline || null,
      career_path_id: form.career_path_id || null,
      work_mode: form.work_mode || null,
      engagement_type: form.engagement_type || null,
      experience_level: form.experience_level || null,
      ...(approveOnSave ? { review_status: "approved" as const, is_active: true } : {}),
    };
    const problem = job
      ? writeProblem("save the job", await supabase.from("jobs").update(payload).eq("id", job.id).select("id"))
      : await supabase.from("jobs").insert({ ...payload, posted_by: adminId || null }).then(({ error }) => (error ? friendlyDbError("post the job", error) : null));
    setSaving(false);
    if (problem) return onError(problem);
    onSaved();
  }

  const heading = approveOnSave ? "Check and approve job" : job ? "Edit job" : "Post a new job";
  const submit = approveOnSave ? "Save and approve" : job ? "Save changes" : "Post job";

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3 className="title-sm" style={{ marginBottom: 16 }}>{heading}</h3>
      <div className="form-grid">
        <Text id="title" label="Job title" value={form.title} onChange={set} error={formErrors.title} full />
        <Text id="company" label="Organisation" value={form.company} onChange={set} error={formErrors.company} />
        <Text id="location" label="Location" optional value={form.location} onChange={set} placeholder="e.g. Lagos, Ikeja" />
        <Select id="work_mode" label="Work mode" value={form.work_mode} onChange={set} options={WORK_MODE_LABELS} omit={["any"]} />
        <Select id="engagement_type" label="Job type" value={form.engagement_type} onChange={set} options={ENGAGEMENT_LABELS} />
        <Select id="experience_level" label="Experience level" value={form.experience_level} onChange={set} options={LEVEL_LABELS} />
        <Select id="career_path_id" label="Career path" value={form.career_path_id}
          onChange={set} options={Object.fromEntries(careerPaths.map((c) => [c.id, c.name]))} />
        <Text id="deadline" label="Application deadline" optional type="date" value={form.deadline} onChange={set} />
        <Text id="salary_range" label="Salary range" optional value={form.salary_range} onChange={set} placeholder="e.g. ₦250k – ₦400k / month" />
        <Text id="application_link" label="Application or referral link" type="url" value={form.application_link} onChange={set}
          error={formErrors.application_link} placeholder="https://" hint="Members tap Apply and go straight here." full />
        <div className="field full">
          <label className="label" htmlFor="j-description">Short description <span className="opt">(optional)</span></label>
          <textarea id="j-description" className="input" maxLength={5000} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
      <div className="row-wrap">
        <button type="submit" className="btn btn-solid" disabled={saving}>
          {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : submit}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

function Text({ id, label, value, onChange, error, optional, type = "text", placeholder, hint, full }: {
  id: keyof JobForm; label: string; value: string; onChange: (k: keyof JobForm, v: string) => void;
  error?: string; optional?: boolean; type?: string; placeholder?: string; hint?: string; full?: boolean;
}) {
  const describedBy = [hint && `jh-${id}`, error && `je-${id}`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="label" htmlFor={`j-${id}`}>{label} {optional && <span className="opt">(optional)</span>}</label>
      {hint && <span className="hint" id={`jh-${id}`}>{hint}</span>}
      <input id={`j-${id}`} className="input" type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(id, e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} />
      {error && <span className="field-error" id={`je-${id}`}><CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {error}</span>}
    </div>
  );
}

function Select({ id, label, value, onChange, options, omit = [] }: {
  id: keyof JobForm; label: string; value: string; onChange: (k: keyof JobForm, v: string) => void;
  options: Record<string, string>; omit?: string[];
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={`j-${id}`}>{label} <span className="opt">(optional)</span></label>
      <select id={`j-${id}`} className="input" value={value} onChange={(e) => onChange(id, e.target.value)}>
        <option value="">Not specified</option>
        {Object.entries(options).filter(([v]) => !omit.includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
