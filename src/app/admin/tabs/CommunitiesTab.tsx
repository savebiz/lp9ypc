"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Pencil, Plus, UserMinus, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Community, CommunityOverview, Profile } from "@/types";
import { FieldError, SLUG_RE, friendlyDbError, memberNames, slugify, type AdminData, type TabActions } from "./shared";
import styles from "../admin.module.css";

interface CommunityForm {
  name: string;
  slug: string;
  description: string;
  kind: "career" | "interest";
  is_active: boolean;
}
const EMPTY: CommunityForm = { name: "", slug: "", description: "", kind: "interest", is_active: true };

export default function CommunitiesTab({ communities, communityMembers, communityOverview, members, adminId, onError, onSuccess, onChanged }: TabActions & {
  communities: Community[];
  communityMembers: AdminData["communityMembers"];
  communityOverview: CommunityOverview[];
  members: Profile[];
  adminId: string;
}) {
  const [editing, setEditing] = useState<Community | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CommunityForm>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CommunityForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const names = useMemo(() => memberNames(members), [members]);
  const threadCount = useMemo(() => new Map(communityOverview.map((o) => [o.community_id, o.thread_count])), [communityOverview]);
  const byCommunity = useMemo(() => {
    const m = new Map<string, AdminData["communityMembers"]>();
    for (const row of communityMembers) m.set(row.community_id, [...(m.get(row.community_id) ?? []), row]);
    return m;
  }, [communityMembers]);

  function openNew() {
    setEditing(null); setForm(EMPTY); setSlugTouched(false); setErrors({}); setShowForm(true);
  }
  function openEdit(c: Community) {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, description: c.description ?? "", kind: c.kind, is_active: c.is_active });
    setSlugTouched(true); setErrors({}); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function set<K extends keyof CommunityForm>(k: K, v: CommunityForm[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "name" && !slugTouched) next.slug = slugify(String(v));
      return next;
    });
    setErrors((e) => ({ ...e, [k]: undefined, ...(k === "name" && !slugTouched ? { slug: undefined } : {}) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof CommunityForm, string>> = {};
    if (!form.name.trim()) errs.name = "Give the community a name";
    else if (form.name.trim().length > 80) errs.name = "Keep the name under 80 characters";
    if (!SLUG_RE.test(form.slug) || form.slug.length > 60) {
      errs.slug = "Use lower-case letters, numbers and single dashes only, e.g. faith-and-fellowship";
    }
    if (form.description.length > 500) errs.description = "Keep the description under 500 characters";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`c-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    setSaving(true); onError("");
    const supabase = createClient();
    const payload = {
      name: form.name.trim(), slug: form.slug, description: form.description.trim() || null,
      kind: form.kind, is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("communities").update(payload).eq("id", editing.id)
      : await supabase.from("communities").insert({ ...payload, created_by: adminId || null });
    setSaving(false);
    if (error) {
      if (error.code === "23505") return onError("A community with that name or web address already exists. Choose a different one.");
      return onError(friendlyDbError("save the community", error));
    }
    onSuccess(editing ? "Community saved." : `Community "${payload.name}" created.`);
    setShowForm(false); setEditing(null);
    onChanged();
  }

  async function makeManager(c: Community, member: Profile) {
    onError("");
    const supabase = createClient();
    const existing = (byCommunity.get(c.id) ?? []).find((r) => r.member_id === member.id);
    const { error } = existing
      ? await supabase.from("community_members").update({ role: "manager" }).eq("community_id", c.id).eq("member_id", member.id)
      : await supabase.from("community_members").insert({ community_id: c.id, member_id: member.id, role: "manager" });
    if (error) return onError(friendlyDbError("add the manager", error));
    onSuccess(`${names.get(member.id)} now manages ${c.name}.`);
    setPickerFor(null);
    onChanged();
  }

  async function removeManager(c: Community, memberId: string) {
    const name = names.get(memberId) ?? "This member";
    if (!confirm(`Remove ${name} as a manager of ${c.name}? They'll stay in the community as a member.`)) return;
    onError("");
    const { error } = await createClient().from("community_members").update({ role: "member" })
      .eq("community_id", c.id).eq("member_id", memberId);
    if (error) return onError(friendlyDbError("remove the manager", error));
    onSuccess(`${name} is no longer a manager of ${c.name}.`);
    onChanged();
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h2 className="title-sm">Communities</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Discussion spaces for career paths and shared interests. Managers can restore or remove posts in their community.
          </p>
        </div>
        {!showForm && <button className="btn btn-solid btn-sm" onClick={openNew}><Plus size={18} aria-hidden="true" /> New community</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <h3 className="title-sm" style={{ marginBottom: 16 }}>{editing ? "Edit community" : "New community"}</h3>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="c-name">Name</label>
              <input id="c-name" className="input" maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)}
                aria-invalid={!!errors.name} aria-describedby={errors.name ? "ce-name" : undefined} />
              {errors.name && <FieldError id="ce-name" msg={errors.name} />}
            </div>
            <div className="field">
              <label className="label" htmlFor="c-slug">Web address</label>
              <span className="hint" id="ch-slug">The community lives at /community/{form.slug || "…"}</span>
              <input id="c-slug" className="input" maxLength={60} value={form.slug}
                onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }}
                aria-invalid={!!errors.slug} aria-describedby={`ch-slug${errors.slug ? " ce-slug" : ""}`} />
              {errors.slug && <FieldError id="ce-slug" msg={errors.slug} />}
            </div>
            <div className="field full">
              <label className="label" htmlFor="c-description">Description <span className="opt">(optional)</span></label>
              <textarea id="c-description" className="input" maxLength={500} value={form.description}
                onChange={(e) => set("description", e.target.value)} aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "ce-description" : undefined}
                placeholder="One or two sentences on what members talk about here." />
              {errors.description && <FieldError id="ce-description" msg={errors.description} />}
            </div>
            <div className="field">
              <label className="label" htmlFor="c-kind">Type</label>
              <select id="c-kind" className="input" value={form.kind} onChange={(e) => set("kind", e.target.value as CommunityForm["kind"])}>
                <option value="career">Career community</option>
                <option value="interest">Interest community</option>
              </select>
            </div>
            <div className="field">
              <span className="label" aria-hidden="true">&nbsp;</span>
              <label className="check-row">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
                <span>
                  <strong>Active</strong>
                  <span className="hint" style={{ display: "block", marginTop: 2 }}>Inactive communities are hidden from members.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="row-wrap">
            <button type="submit" className="btn btn-solid" disabled={saving}>
              {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : editing ? "Save changes" : "Create community"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditing(null); }} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {communities.length === 0 ? (
        <div className="empty">No communities yet. Use <strong>New community</strong> to create the first one.</div>
      ) : (
        <div className="list">
          {communities.map((c) => {
            const rows = byCommunity.get(c.id) ?? [];
            const managers = rows.filter((r) => r.role === "manager");
            return (
              <div key={c.id} className={`list-item ${styles.itemColumn}${c.is_active ? "" : " dim"}`}>
                <div className={styles.itemHead}>
                  <div className={styles.itemMain}>
                    <div className="row-wrap" style={{ gap: 8 }}>
                      <strong>{c.name}</strong>
                      <span className={`status ${c.is_active ? "ok" : "off"}`}>{c.is_active ? "Active" : "Hidden"}</span>
                      <span className="status off">{c.kind === "career" ? "Career" : "Interest"}</span>
                    </div>
                    {c.description && <p className="small ink-2" style={{ marginTop: 2 }}>{c.description}</p>}
                    <p className="small muted" style={{ marginTop: 2 }}>
                      {rows.length} member{rows.length === 1 ? "" : "s"} · {threadCount.get(c.id) ?? 0} discussion{(threadCount.get(c.id) ?? 0) === 1 ? "" : "s"} · /community/{c.slug}
                    </p>
                  </div>
                  <div className="actions">
                    {c.is_active && (
                      <Link href={`/community/${encodeURIComponent(c.slug)}`} className="icon-btn" aria-label={`Open ${c.name}`} title="Open">
                        <ExternalLink size={18} />
                      </Link>
                    )}
                    <button type="button" className="icon-btn" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit"><Pencil size={18} /></button>
                  </div>
                </div>

                <div className={styles.itemFull}>
                  <div className={styles.managers}>
                    <p className="small" style={{ fontWeight: 600 }}>Managers</p>
                    {managers.length === 0 ? (
                      <p className="small muted">None yet</p>
                    ) : (
                      <ul className={styles.managerList}>
                        {managers.map((m) => (
                          <li key={m.member_id}>
                            <span className="small">{names.get(m.member_id) ?? "Unknown member"}</span>
                            <button type="button" className="btn-link small" onClick={() => removeManager(c, m.member_id)}
                              aria-label={`Remove ${names.get(m.member_id) ?? "this member"} as manager of ${c.name}`}>
                              <UserMinus size={16} aria-hidden="true" /> Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pickerFor !== c.id && (
                      <button type="button" className="btn-link small" onClick={() => setPickerFor(c.id)}>
                        <UserPlus size={16} aria-hidden="true" /> Add a manager
                      </button>
                    )}
                  </div>
                  {pickerFor === c.id && (
                    <ManagerPicker
                      community={c}
                      members={members}
                      excludeIds={new Set(managers.map((m) => m.member_id))}
                      onPick={(m) => makeManager(c, m)}
                      onClose={() => setPickerFor(null)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Searchable list of registered members to make one a manager. */
function ManagerPicker({ community, members, excludeIds, onPick, onClose }: {
  community: Community; members: Profile[]; excludeIds: Set<string>; onPick: (m: Profile) => Promise<void>; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const s = q.trim().toLowerCase();
  const matches = s.length < 2
    ? []
    : members
        .filter((m) => !excludeIds.has(m.id))
        .filter((m) => [m.full_name, m.email, m.phone].some((v) => v?.toLowerCase().includes(s)))
        .slice(0, 8);
  const inputId = `mp-${community.id}`;

  return (
    <div className={styles.picker}>
      <div className="row" style={{ marginBottom: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
        <label className="label" htmlFor={inputId} style={{ paddingTop: 10 }}>Add a manager to {community.name}</label>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <input id={inputId} className="input" type="search" autoFocus placeholder="Type a name, email or phone…" value={q}
        onChange={(e) => setQ(e.target.value)} aria-describedby={`${inputId}-h`} />
      <span className="hint" id={`${inputId}-h`} role="status">
        {s.length < 2 ? "Type at least 2 letters." : matches.length === 0 ? "No members match." : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
      </span>
      {matches.length > 0 && (
        <ul className={styles.pickList}>
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" className={styles.pickItem} disabled={busy}
                onClick={async () => { setBusy(true); await onPick(m); setBusy(false); }}>
                <span>
                  <strong>{m.full_name || "—"}</strong>
                  <span className="small muted" style={{ display: "block", overflowWrap: "anywhere" }}>{m.email}</span>
                </span>
                <span className="small text-blue" style={{ fontWeight: 600, flexShrink: 0 }}>Make manager</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
