"use client";

import { useState } from "react";
import { CalendarDays, ExternalLink, Eye, EyeOff, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, hostnameOf, safeHttpUrl } from "@/lib/utils";
import type { Announcement, AnnouncementScope } from "@/types";
import { FieldError, formatDateTime, friendlyDbError, isoToLocalInput, localInputToIso, writeProblem, type TabActions } from "./shared";
import styles from "../admin.module.css";

export const SCOPE_LABELS: Record<AnnouncementScope, string> = {
  parish: "Parish",
  province: "Provincial",
  region: "Regional",
  national: "National",
};

interface AnnForm {
  title: string;
  content: string;
  scope: AnnouncementScope;
  scope_label: string;
  kind: "announcement" | "event";
  starts_at: string; // datetime-local value
  ends_at: string;
  location: string;
  link_url: string;
}
const EMPTY: AnnForm = {
  title: "", content: "", scope: "province", scope_label: "", kind: "announcement",
  starts_at: "", ends_at: "", location: "", link_url: "",
};

function toForm(a: Announcement): AnnForm {
  return {
    title: a.title, content: a.content ?? "", scope: a.scope ?? "province", scope_label: a.scope_label ?? "",
    kind: a.kind ?? "announcement", starts_at: isoToLocalInput(a.starts_at), ends_at: isoToLocalInput(a.ends_at),
    location: a.location ?? "", link_url: a.link_url ?? "",
  };
}

/** News & events: announcements and events at parish, provincial, regional or national level. */
export default function AnnouncementsTab({ announcements, adminId, onError, onSuccess, onChanged }: TabActions & {
  announcements: Announcement[]; adminId: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof AnnForm, string>>>({});
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null); setForm(EMPTY); setErrors({}); setShowForm(true);
  }
  function openEdit(a: Announcement) {
    setEditing(a); setForm(toForm(a)); setErrors({}); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function set<K extends keyof AnnForm>(k: K, v: AnnForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof AnnForm, string>> = {};
    if (!form.title.trim()) errs.title = "Give it a title";
    const startsAt = localInputToIso(form.starts_at);
    const endsAt = localInputToIso(form.ends_at);
    if (form.kind === "event" && !startsAt) errs.starts_at = "Add when the event starts";
    if (form.starts_at && !startsAt) errs.starts_at = "Enter a valid date and time";
    if (form.ends_at && !endsAt) errs.ends_at = "Enter a valid date and time";
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) errs.ends_at = "The end must be after the start";
    const link = form.link_url.trim() ? safeHttpUrl(form.link_url) : null;
    if (form.link_url.trim() && !link) errs.link_url = "Paste the full link, starting with https://";
    else if (link && link.length > 2000) errs.link_url = "That link is too long";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`a-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    setSaving(true); onError("");
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      content: form.content.trim() || null,
      scope: form.scope,
      scope_label: form.scope_label.trim() || null,
      kind: form.kind,
      starts_at: startsAt,
      ends_at: endsAt,
      location: form.location.trim() || null,
      link_url: link,
    };
    const problem = editing
      ? writeProblem("save the post", await supabase.from("announcements").update(payload).eq("id", editing.id).select("id"))
      : await supabase.from("announcements").insert({ ...payload, posted_by: adminId || null })
          .then(({ error }) => (error ? friendlyDbError("publish the post", error) : null));
    setSaving(false);
    if (problem) return onError(problem);
    onSuccess(editing ? "Saved." : form.kind === "event" ? "Event posted." : "Announcement posted.");
    setShowForm(false); setEditing(null); setForm(EMPTY);
    onChanged();
  }

  async function toggle(a: Announcement) {
    onError("");
    const problem = writeProblem(a.is_active ? "hide the post" : "show the post",
      await createClient().from("announcements").update({ is_active: !a.is_active }).eq("id", a.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(a.is_active ? `"${a.title}" is hidden.` : `"${a.title}" is live again.`);
    onChanged();
  }

  async function remove(a: Announcement) {
    if (!confirm(`Delete "${a.title}" permanently? Hiding it instead can be undone.`)) return;
    onError("");
    const problem = writeProblem("delete the post", await createClient().from("announcements").delete().eq("id", a.id).select("id"));
    if (problem) return onError(problem);
    onSuccess(`"${a.title}" was deleted.`);
    onChanged();
  }

  const isEvent = form.kind === "event";

  return (
    <div className="stack">
      <div className="spread">
        <h2 className="title-sm">News &amp; events</h2>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> New post</button>}
      </div>
      <p className="small muted">Live posts appear on the News &amp; events page, the home page and every member&apos;s dashboard.</p>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <h3 className="title-sm" style={{ marginBottom: 16 }}>{editing ? "Edit post" : "New post"}</h3>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="a-kind">Type</label>
              <select id="a-kind" className="input" value={form.kind} onChange={(e) => set("kind", e.target.value as AnnForm["kind"])}>
                <option value="announcement">Announcement</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="a-scope">Level</label>
              <select id="a-scope" className="input" value={form.scope} onChange={(e) => set("scope", e.target.value as AnnouncementScope)}>
                {(Object.keys(SCOPE_LABELS) as AnnouncementScope[]).map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="field full">
              <label className="label" htmlFor="a-title">Title</label>
              <input id="a-title" className="input" maxLength={160} value={form.title} onChange={(e) => set("title", e.target.value)}
                aria-invalid={!!errors.title} aria-describedby={errors.title ? "ae-title" : undefined} />
              {errors.title && <FieldError id="ae-title" msg={errors.title} />}
            </div>
            <div className="field full">
              <label className="label" htmlFor="a-scope_label">Parish, province or region name <span className="opt">(optional)</span></label>
              <input id="a-scope_label" className="input" maxLength={120} value={form.scope_label} onChange={(e) => set("scope_label", e.target.value)}
                placeholder="e.g. Jesus House Parish, or Lagos Province 9" aria-describedby="ah-scope_label" />
              <span className="hint" id="ah-scope_label">Shown next to the level, so members know which parish or region it&apos;s for.</span>
            </div>
            <div className="field full">
              <label className="label" htmlFor="a-content">Details <span className="opt">(optional)</span></label>
              <textarea id="a-content" className="input" maxLength={2000} value={form.content} onChange={(e) => set("content", e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="a-starts_at">Starts, Lagos time {!isEvent && <span className="opt">(optional)</span>}</label>
              <input id="a-starts_at" className="input" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)}
                aria-invalid={!!errors.starts_at} aria-describedby={errors.starts_at ? "ae-starts_at" : undefined} />
              {errors.starts_at && <FieldError id="ae-starts_at" msg={errors.starts_at} />}
            </div>
            <div className="field">
              <label className="label" htmlFor="a-ends_at">Ends, Lagos time <span className="opt">(optional)</span></label>
              <input id="a-ends_at" className="input" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)}
                aria-invalid={!!errors.ends_at} aria-describedby={errors.ends_at ? "ae-ends_at" : undefined} />
              {errors.ends_at && <FieldError id="ae-ends_at" msg={errors.ends_at} />}
            </div>
            <div className="field">
              <label className="label" htmlFor="a-location">Location <span className="opt">(optional)</span></label>
              <input id="a-location" className="input" maxLength={200} value={form.location} onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Province 9 HQ, Ikeja — or Online" />
            </div>
            <div className="field">
              <label className="label" htmlFor="a-link_url">Link <span className="opt">(optional)</span></label>
              <input id="a-link_url" className="input" type="url" inputMode="url" maxLength={2000} placeholder="https://" value={form.link_url}
                onChange={(e) => set("link_url", e.target.value)} aria-invalid={!!errors.link_url}
                aria-describedby={`ah-link_url${errors.link_url ? " ae-link_url" : ""}`} />
              <span className="hint" id="ah-link_url">Registration form, flyer or livestream. Must start with https://</span>
              {errors.link_url && <FieldError id="ae-link_url" msg={errors.link_url} />}
            </div>
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : editing ? "Save changes" : isEvent ? "Post event" : "Post announcement"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {announcements.length === 0 ? (
        <div className="empty">No announcements or events yet.</div>
      ) : (
        <div className="list">
          {announcements.map((a) => {
            const link = safeHttpUrl(a.link_url);
            return (
              <div key={a.id} className={`list-item${a.is_active ? "" : " dim"}`}>
                <div className="grow">
                  <div className="row-wrap" style={{ gap: 8 }}>
                    <strong>{a.title}</strong>
                    <span className={`status ${a.is_active ? "ok" : "off"}`}>{a.is_active ? "Live" : "Hidden"}</span>
                  </div>
                  <p className="small ink-2" style={{ marginTop: 2 }}>
                    {a.kind === "event" ? "Event" : "Announcement"} · {SCOPE_LABELS[a.scope] ?? "Provincial"}
                    {a.scope_label ? ` · ${a.scope_label}` : ""}
                  </p>
                  {a.content && <p className="small ink-2" style={{ marginTop: 4 }}>{a.content}</p>}
                  {(a.starts_at || a.location || link) && (
                    <p className={`small ink-2 ${styles.metaRow}`} style={{ marginTop: 4 }}>
                      {a.starts_at && (
                        <span><CalendarDays size={14} aria-hidden="true" /> {formatDateTime(a.starts_at)}{a.ends_at ? ` – ${formatDateTime(a.ends_at)}` : ""}</span>
                      )}
                      {a.location && <span><MapPin size={14} aria-hidden="true" /> {a.location}</span>}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                          {hostnameOf(link)} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                    </p>
                  )}
                  <p className="small muted" style={{ marginTop: 4 }}>Posted {formatDate(a.created_at)}</p>
                </div>
                <div className="actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)} aria-label={`Edit ${a.title}`}><Pencil size={16} aria-hidden="true" /> Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(a)} aria-label={`${a.is_active ? "Hide" : "Show"} ${a.title}`}>
                    {a.is_active ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {a.is_active ? "Hide" : "Show"}
                  </button>
                  <button className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => remove(a)} aria-label={`Delete ${a.title}`}><Trash2 size={16} aria-hidden="true" /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
