"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, ArchiveRestore, CircleAlert, Download, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EMPLOYMENT_STATUS_LABELS, ENGAGEMENT_LABELS, LEVEL_LABELS, WORK_MODE_LABELS,
  csvCell, formatDate, hostnameOf, isExpired, safeHttpUrl, shortPathName,
} from "@/lib/utils";
import type { Announcement, CareerPath, Job, Profile } from "@/types";

type Tab = "overview" | "jobs" | "members" | "announcements";

interface Props {
  jobs: Job[];
  members: Profile[];
  careerPaths: CareerPath[];
  announcements: Announcement[];
  memberPaths: { member_id: string; career_path_id: string }[];
}

const EMPTY_JOB = {
  title: "", company: "", location: "", work_mode: "", engagement_type: "", experience_level: "",
  deadline: "", description: "", career_path_id: "", application_link: "", salary_range: "",
};
type JobForm = typeof EMPTY_JOB;

export default function AdminClient({ jobs, members, careerPaths, announcements, memberPaths }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const refresh = () => startTransition(() => router.refresh());

  const pathsByMember = useMemo(() => {
    const byId = new Map(careerPaths.map((c) => [c.id, c]));
    const m = new Map<string, CareerPath[]>();
    for (const l of memberPaths) {
      const cp = byId.get(l.career_path_id);
      if (cp) m.set(l.member_id, [...(m.get(l.member_id) ?? []), cp]);
    }
    return m;
  }, [memberPaths, careerPaths]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "jobs", label: `Jobs (${jobs.length})` },
    { key: "members", label: `Members (${members.length})` },
    { key: "announcements", label: `Announcements (${announcements.length})` },
  ];

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {tabs.map((t) => (
          <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} onClick={() => { setTab(t.key); setError(""); }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" role="alert"><CircleAlert size={18} aria-hidden="true" /> {error}</div>
      )}
      {pending && <p className="row small muted" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Updating…</p>}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && <Overview jobs={jobs} members={members} careerPaths={careerPaths} memberPaths={memberPaths} />}
        {tab === "jobs" && <JobsTab jobs={jobs} careerPaths={careerPaths} onError={setError} onChanged={refresh} />}
        {tab === "members" && <MembersTab members={members} careerPaths={careerPaths} pathsByMember={pathsByMember} />}
        {tab === "announcements" && <AnnouncementsTab announcements={announcements} onError={setError} onChanged={refresh} />}
      </div>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────── */
function Overview({ jobs, members, careerPaths, memberPaths }: Pick<Props, "jobs" | "members" | "careerPaths" | "memberPaths">) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = members.filter((m) => new Date(m.created_at).getTime() > weekAgo).length;
  const activeJobs = jobs.filter((j) => j.is_active && !isExpired(j.deadline)).length;
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

function Stat({ n, label }: { n: number; label: string }) {
  return <div className="stat"><div className="num">{n}</div><div className="lbl">{label}</div></div>;
}

/* ── Jobs ─────────────────────────────────────────────────────────────── */
function JobsTab({ jobs, careerPaths, onError, onChanged }: {
  jobs: Job[]; careerPaths: CareerPath[]; onError: (m: string) => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Job | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobForm>(EMPTY_JOB);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof JobForm, string>>>({});
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null); setForm(EMPTY_JOB); setFormErrors({}); setShowForm(true);
  }
  function openEdit(j: Job) {
    setEditing(j);
    setForm({
      title: j.title, company: j.company, location: j.location ?? "", work_mode: j.work_mode ?? "",
      engagement_type: j.engagement_type ?? "", experience_level: j.experience_level ?? "", deadline: j.deadline ?? "",
      description: j.description ?? "", career_path_id: j.career_path_id ?? "", application_link: j.application_link,
      salary_range: j.salary_range ?? "",
    });
    setFormErrors({}); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const set = (k: keyof JobForm, v: string) => { setForm((f) => ({ ...f, [k]: v })); setFormErrors((e) => ({ ...e, [k]: undefined })); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof JobForm, string>> = {};
    if (!form.title.trim()) errs.title = "Required";
    if (!form.company.trim()) errs.company = "Required";
    if (!safeHttpUrl(form.application_link)) errs.application_link = "Paste the full link, starting with https://";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true); onError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      ...form,
      application_link: safeHttpUrl(form.application_link)!,
      deadline: form.deadline || null,
      career_path_id: form.career_path_id || null,
      work_mode: form.work_mode || null,
      engagement_type: form.engagement_type || null,
      experience_level: form.experience_level || null,
    };
    const { error } = editing
      ? await supabase.from("jobs").update(payload).eq("id", editing.id)
      : await supabase.from("jobs").insert({ ...payload, posted_by: user?.id ?? null });
    setSaving(false);
    if (error) return onError(`Couldn't save the job: ${error.message}`);
    setShowForm(false); setEditing(null);
    onChanged();
  }

  async function toggleActive(j: Job) {
    onError("");
    const { error } = await createClient().from("jobs").update({ is_active: !j.is_active }).eq("id", j.id);
    if (error) return onError(`Couldn't update the job: ${error.message}`);
    onChanged();
  }

  async function remove(j: Job) {
    if (!confirm(`Delete "${j.title}" permanently? Members who saved it will lose it. Archiving hides it instead and can be undone.`)) return;
    onError("");
    const { error } = await createClient().from("jobs").delete().eq("id", j.id);
    if (error) return onError(`Couldn't delete the job: ${error.message}`);
    onChanged();
  }

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-sm">Job listings</h2>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> Post a job</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <h3 className="title-sm" style={{ marginBottom: 16 }}>{editing ? "Edit job" : "Post a new job"}</h3>
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
              {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : editing ? "Save changes" : "Post job"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {jobs.length === 0 ? (
        <div className="empty">No jobs yet. Use <strong>Post a job</strong> to add the first one.</div>
      ) : (
        <div className="list">
          {jobs.map((j) => {
            const expired = isExpired(j.deadline);
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
                </div>
                <div className="actions">
                  <Link href={`/jobs/${j.id}`} className="icon-btn" aria-label={`View ${j.title}`} title="View"><ExternalLink size={18} /></Link>
                  <button className="icon-btn" onClick={() => openEdit(j)} aria-label={`Edit ${j.title}`} title="Edit"><Pencil size={18} /></button>
                  <button className="icon-btn" onClick={() => toggleActive(j)} aria-label={`${j.is_active ? "Archive" : "Restore"} ${j.title}`} title={j.is_active ? "Archive" : "Restore"}>
                    {j.is_active ? <Archive size={18} /> : <ArchiveRestore size={18} />}
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(j)} aria-label={`Delete ${j.title}`} title="Delete"><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Text({ id, label, value, onChange, error, optional, type = "text", placeholder, hint, full }: {
  id: keyof JobForm; label: string; value: string; onChange: (k: keyof JobForm, v: string) => void;
  error?: string; optional?: boolean; type?: string; placeholder?: string; hint?: string; full?: boolean;
}) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="label" htmlFor={`j-${id}`}>{label} {optional && <span className="opt">(optional)</span>}</label>
      {hint && <span className="hint">{hint}</span>}
      <input id={`j-${id}`} className="input" type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(id, e.target.value)} aria-invalid={!!error} />
      {error && <span className="field-error"><CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {error}</span>}
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

/* ── Members ──────────────────────────────────────────────────────────── */
function MembersTab({ members, careerPaths, pathsByMember }: {
  members: Profile[]; careerPaths: CareerPath[]; pathsByMember: Map<string, CareerPath[]>;
}) {
  const [q, setQ] = useState("");
  const [path, setPath] = useState("");

  const filtered = members.filter((m) => {
    if (path && !(pathsByMember.get(m.id) ?? []).some((c) => c.id === path)) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [m.full_name, m.email, m.phone, m.profession, m.area_of_residence].some((v) => v?.toLowerCase().includes(s));
  });

  function exportCsv() {
    const headers = ["Full name", "Email", "Phone", "Area of residence", "Parish / unit", "Profession",
      "Employment status", "Preferred work mode", "Career paths", "Consents to updates", "Role", "Joined"];
    const rows = filtered.map((m) => [
      m.full_name, m.email, m.phone, m.area_of_residence, m.parish_unit, m.profession,
      m.employment_status ? EMPLOYMENT_STATUS_LABELS[m.employment_status] : "",
      m.preferred_work_mode ? WORK_MODE_LABELS[m.preferred_work_mode] : "",
      (pathsByMember.get(m.id) ?? []).map((c) => c.name).join("; "),
      m.consent_updates ? "Yes" : "No",
      m.role,
      new Date(m.created_at).toISOString().slice(0, 10),
    ]);
    const csv = "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lp9ypc-members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="toolbar" style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="row-wrap" style={{ gap: 10 }}>
          <label htmlFor="m-search" className="sr-only">Search members</label>
          <input id="m-search" className="input" style={{ maxWidth: 320 }} type="search" placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label htmlFor="m-path" className="sr-only">Filter by career path</label>
          <select id="m-path" className="input" style={{ maxWidth: 280 }} value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="">All career paths</option>
            {careerPaths.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={18} aria-hidden="true" /> Export CSV ({filtered.length})
        </button>
      </div>
      <p className="small muted">Member data is personal information. Only export what you need, and don&apos;t share the file outside the YPC team.</p>

      {filtered.length === 0 ? (
        <div className="empty">{members.length === 0 ? "No members have registered yet." : "No members match."}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Area</th><th scope="col">Work</th>
                <th scope="col">Career paths</th><th scope="col">Updates</th><th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td data-label="Name">
                    <strong>{m.full_name || "—"}</strong>
                    {m.role === "admin" && <> <span className="status admin">Admin</span></>}
                  </td>
                  <td data-label="Contact"><span style={{ overflowWrap: "anywhere" }}>{m.email}<br />{m.phone ?? ""}</span></td>
                  <td data-label="Area">{m.area_of_residence ?? "—"}{m.parish_unit ? ` · ${m.parish_unit}` : ""}</td>
                  <td data-label="Work">
                    {m.profession ?? "—"}
                    <span className="small muted" style={{ display: "block" }}>
                      {[m.employment_status && EMPLOYMENT_STATUS_LABELS[m.employment_status], m.preferred_work_mode && WORK_MODE_LABELS[m.preferred_work_mode]].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td data-label="Paths">{(pathsByMember.get(m.id) ?? []).map((c) => shortPathName(c.name)).join(", ") || "—"}</td>
                  <td data-label="Updates">{m.consent_updates ? "Yes" : "No"}</td>
                  <td data-label="Joined">{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Announcements ────────────────────────────────────────────────────── */
function AnnouncementsTab({ announcements, onError, onChanged }: {
  announcements: Announcement[]; onError: (m: string) => void; onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return onError("Give the announcement a title.");
    setSaving(true); onError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("announcements").insert({ title: title.trim(), content: content.trim() || null, posted_by: user?.id ?? null });
    setSaving(false);
    if (error) return onError(`Couldn't post the announcement: ${error.message}`);
    setTitle(""); setContent(""); setShowForm(false);
    onChanged();
  }

  async function toggle(a: Announcement) {
    onError("");
    const { error } = await createClient().from("announcements").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return onError(`Couldn't update it: ${error.message}`);
    onChanged();
  }

  async function remove(a: Announcement) {
    if (!confirm(`Delete "${a.title}" permanently? Hiding it instead can be undone.`)) return;
    onError("");
    const { error } = await createClient().from("announcements").delete().eq("id", a.id);
    if (error) return onError(`Couldn't delete it: ${error.message}`);
    onChanged();
  }

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-sm">Announcements</h2>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={() => setShowForm(true)}><Plus size={18} aria-hidden="true" /> New announcement</button>}
      </div>
      <p className="small muted">Live announcements appear on the home page and on every member&apos;s dashboard.</p>

      {showForm && (
        <form className="card" onSubmit={create} noValidate>
          <div className="field">
            <label className="label" htmlFor="a-title">Title</label>
            <input id="a-title" className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="a-content">Details <span className="opt">(optional)</span></label>
            <textarea id="a-content" className="input" maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-solid" disabled={saving}>{saving ? "Posting…" : "Post announcement"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {announcements.length === 0 ? (
        <div className="empty">No announcements yet.</div>
      ) : (
        <div className="list">
          {announcements.map((a) => (
            <div key={a.id} className={`list-item${a.is_active ? "" : " dim"}`}>
              <div className="grow">
                <div className="row-wrap" style={{ gap: 8 }}>
                  <strong>{a.title}</strong>
                  <span className={`status ${a.is_active ? "ok" : "off"}`}>{a.is_active ? "Live" : "Hidden"}</span>
                </div>
                {a.content && <p className="small ink-2" style={{ marginTop: 4 }}>{a.content}</p>}
                <p className="small muted" style={{ marginTop: 4 }}>{formatDate(a.created_at)}</p>
              </div>
              <div className="actions">
                <button className="icon-btn" onClick={() => toggle(a)} aria-label={`${a.is_active ? "Hide" : "Show"} ${a.title}`} title={a.is_active ? "Hide" : "Show"}>
                  {a.is_active ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button className="icon-btn danger" onClick={() => remove(a)} aria-label={`Delete ${a.title}`} title="Delete"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
