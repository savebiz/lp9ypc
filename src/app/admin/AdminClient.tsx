"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { formatDate, WORK_MODE_LABELS, ENGAGEMENT_LABELS } from "@/lib/utils";
import type { Job, Profile, CareerPath, Announcement } from "@/types";

interface Props {
  jobs: Job[];
  members: Profile[];
  careerPaths: CareerPath[];
  announcements: Announcement[];
}

interface JobForm {
  title: string;
  company: string;
  location: string;
  work_mode: string;
  engagement_type: string;
  experience_level: string;
  deadline: string;
  description: string;
  career_path_id: string;
  application_link: string;
  salary_range: string;
}

interface AnnouncementForm {
  title: string;
  content: string;
}

type Tab = "jobs" | "members" | "announcements";

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
);
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
);
const IconArchive = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="4" width="20" height="5" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
);
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconEyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);
const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const IconSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

export default function AdminClient({ jobs: initialJobs, members, careerPaths, announcements: initialAnnouncements }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showAnnForm, setShowAnnForm] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const jobForm = useForm<JobForm>();
  const annForm = useForm<AnnouncementForm>();

  function openNewJob() {
    jobForm.reset({});
    setEditingJob(null);
    setShowJobForm(true);
  }

  function openEditJob(job: Job) {
    setEditingJob(job);
    jobForm.reset({
      title: job.title,
      company: job.company,
      location: job.location ?? "",
      work_mode: job.work_mode ?? "",
      engagement_type: job.engagement_type ?? "",
      experience_level: job.experience_level ?? "",
      deadline: job.deadline ?? "",
      description: job.description ?? "",
      career_path_id: job.career_path_id ?? "",
      application_link: job.application_link,
      salary_range: job.salary_range ?? "",
    });
    setShowJobForm(true);
  }

  async function submitJob(data: JobForm) {
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      ...data,
      deadline: data.deadline || null,
      career_path_id: data.career_path_id || null,
      posted_by: user?.id,
    };
    if (editingJob) {
      const { error: err } = await supabase.from("jobs").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingJob.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from("jobs").insert(payload);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowJobForm(false);
    router.refresh();
  }

  async function toggleJobActive(job: Job) {
    await supabase.from("jobs").update({ is_active: !job.is_active }).eq("id", job.id);
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, is_active: !j.is_active } : j));
  }

  async function deleteJob(jobId: string) {
    if (!confirm("Delete this job listing? This cannot be undone.")) return;
    await supabase.from("jobs").delete().eq("id", jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  async function submitAnnouncement(data: AnnouncementForm) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error: err } = await supabase.from("announcements").insert({ ...data, posted_by: user?.id }).select().single();
    if (err) { setError(err.message); setSaving(false); return; }
    setAnnouncements((prev) => [inserted, ...prev]);
    setSaving(false);
    setShowAnnForm(false);
    annForm.reset();
  }

  async function toggleAnnouncement(ann: Announcement) {
    await supabase.from("announcements").update({ is_active: !ann.is_active }).eq("id", ann.id);
    setAnnouncements((prev) => prev.map((a) => a.id === ann.id ? { ...a, is_active: !a.is_active } : a));
  }

  function exportMembers() {
    const headers = ["Name", "Email", "Phone", "Area", "Profession", "Status", "Joined"];
    const rows = members.map((m) => [
      m.full_name, m.email, m.phone,
      m.area_of_residence ?? "", m.profession ?? "",
      m.employment_status ?? "",
      new Date(m.created_at).toLocaleDateString()
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "lp9ypc-members.csv"; a.click();
  }

  const filteredMembers = members.filter((m) =>
    !memberSearch || m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "jobs", label: `Jobs (${jobs.length})` },
    { key: "members", label: `Members (${members.length})` },
    { key: "announcements", label: `Announcements (${announcements.length})` },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 12, border: "1.5px solid var(--line)",
    fontSize: 14, fontFamily: "var(--font-body)", background: "#fff", color: "var(--ink)",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 600, color: "#555",
    marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em",
  };
  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 18, border: "1px solid var(--line)", padding: 20,
  };
  const iconBtnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 10, border: "1px solid var(--line)",
    background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: "#888", transition: "all .15s",
  };

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "var(--cream)", padding: 4, borderRadius: 16, marginBottom: 28, border: "1px solid var(--line)" }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600,
              fontFamily: "var(--font-display)", cursor: "pointer", transition: "all .15s",
              border: "none", whiteSpace: "nowrap",
              background: tab === key ? "#fff" : "transparent",
              color: tab === key ? "var(--ink)" : "#888",
              boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* JOBS TAB */}
      {tab === "jobs" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, margin: 0 }}>Job Listings</h2>
            <button onClick={openNewJob} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13 }}>
              <IconPlus /> Add Job
            </button>
          </div>

          {error && (
            <div style={{ background: "#fff0f0", border: "1px solid #ffcdd2", color: "#c62828", fontSize: 13, padding: "10px 16px", borderRadius: 12, marginBottom: 16 }}>{error}</div>
          )}

          {showJobForm && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, margin: "0 0 20px" }}>{editingJob ? "Edit Job" : "Add New Job"}</h3>
              <form onSubmit={jobForm.handleSubmit(submitJob)}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Job Title *</label>
                    <input {...jobForm.register("title", { required: true })} style={inputStyle} placeholder="e.g. Frontend Developer" />
                  </div>
                  <div>
                    <label style={labelStyle}>Company *</label>
                    <input {...jobForm.register("company", { required: true })} style={inputStyle} placeholder="Company name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <input {...jobForm.register("location")} style={inputStyle} placeholder="e.g. Lagos, Nigeria" />
                  </div>
                  <div>
                    <label style={labelStyle}>Work Mode</label>
                    <select {...jobForm.register("work_mode")} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="remote">Remote</option>
                      <option value="onsite">On-site</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Engagement Type</label>
                    <select {...jobForm.register("engagement_type")} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                      <option value="graduate-trainee">Graduate Trainee</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Experience Level</label>
                    <select {...jobForm.register("experience_level")} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="entry">Entry Level</option>
                      <option value="mid">Mid Level</option>
                      <option value="senior">Senior</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Deadline</label>
                    <input {...jobForm.register("deadline")} type="date" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Career Path</label>
                    <select {...jobForm.register("career_path_id")} style={inputStyle}>
                      <option value="">Select path</option>
                      {careerPaths.map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.icon} {cp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Salary Range</label>
                    <input {...jobForm.register("salary_range")} style={inputStyle} placeholder="e.g. ₦200k – ₦350k/month" />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Application / Referral Link *</label>
                    <input {...jobForm.register("application_link", { required: true })} type="url" style={inputStyle} placeholder="https://..." />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Description</label>
                    <textarea {...jobForm.register("description")} style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} rows={4} placeholder="Brief description of the role…" />
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                    <button type="submit" disabled={saving} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      {saving ? <><IconSpinner /> Saving…</> : <>{editingJob ? "Update Job" : "Post Job"}</>}
                    </button>
                    <button type="button" onClick={() => setShowJobForm(false)} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#888", fontSize: 14 }}>No jobs posted yet. Click &quot;Add Job&quot; to get started.</div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 14, opacity: job.is_active ? 1 : 0.55 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                    {job.company.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{job.title}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: job.is_active ? "var(--mint)" : "var(--cream)",
                        color: job.is_active ? "#1a6634" : "#888",
                      }}>
                        {job.is_active ? "Active" : "Archived"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {job.company}
                      {job.work_mode ? ` · ${WORK_MODE_LABELS[job.work_mode]}` : ""}
                      {job.engagement_type ? ` · ${ENGAGEMENT_LABELS[job.engagement_type]}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                      Deadline: {formatDate(job.deadline)} · Posted {new Date(job.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEditJob(job)} style={iconBtnStyle} title="Edit"><IconEdit /></button>
                    <button onClick={() => toggleJobActive(job)} style={iconBtnStyle} title={job.is_active ? "Archive" : "Restore"}>
                      {job.is_active ? <IconArchive /> : <IconEye />}
                    </button>
                    <button onClick={() => deleteJob(job.id)} style={{ ...iconBtnStyle, color: "var(--coral)" }} title="Delete"><IconTrash /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {tab === "members" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              style={{ ...inputStyle, maxWidth: 280 }}
              placeholder="Search members…"
            />
            <button onClick={exportMembers} className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <IconDownload /> Export CSV
            </button>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
                    {["Name", "Email", "Profession", "Status", "Role", "Joined"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: 14 }}>No members found</td></tr>
                  ) : (
                    filteredMembers.map((m) => (
                      <tr key={m.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                              {m.full_name.charAt(0)}
                            </div>
                            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{m.full_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#666" }}>{m.email}</td>
                        <td style={{ padding: "12px 16px", color: "#666" }}>{m.profession ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "var(--cream)", color: "#555", fontWeight: 600 }}>
                            {m.employment_status ?? "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 600,
                            background: m.role === "admin" ? "var(--coral)" : "var(--mint)",
                            color: m.role === "admin" ? "#fff" : "#1a6634",
                          }}>
                            {m.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#aaa", fontSize: 12 }}>
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ANNOUNCEMENTS TAB */}
      {tab === "announcements" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, margin: 0 }}>Announcements</h2>
            <button onClick={() => setShowAnnForm(true)} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13 }}>
              <IconPlus /> New
            </button>
          </div>

          {showAnnForm && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, margin: "0 0 20px" }}>New Announcement</h3>
              <form onSubmit={annForm.handleSubmit(submitAnnouncement)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Title *</label>
                    <input {...annForm.register("title", { required: true })} style={inputStyle} placeholder="Announcement title" />
                  </div>
                  <div>
                    <label style={labelStyle}>Content</label>
                    <textarea {...annForm.register("content")} style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} rows={3} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" disabled={saving} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      {saving ? <><IconSpinner /> Posting…</> : "Post Announcement"}
                    </button>
                    <button type="button" onClick={() => { setShowAnnForm(false); annForm.reset(); }} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {announcements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#888", fontSize: 14 }}>No announcements yet.</div>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 14, opacity: ann.is_active ? 1 : 0.55 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{ann.title}</div>
                    {ann.content && <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>{ann.content}</div>}
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>{new Date(ann.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                      background: ann.is_active ? "var(--mint)" : "var(--cream)",
                      color: ann.is_active ? "#1a6634" : "#888",
                    }}>
                      {ann.is_active ? "Live" : "Hidden"}
                    </span>
                    <button onClick={() => toggleAnnouncement(ann)} style={iconBtnStyle} title="Toggle visibility">
                      {ann.is_active ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
