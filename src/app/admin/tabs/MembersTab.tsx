"use client";

import { useState } from "react";
import { Download, FlaskConical, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { CAREER_GOAL_LABELS } from "@/lib/career-match";
import { EMPLOYMENT_STATUS_LABELS, WORK_MODE_LABELS, csvCell, formatDate, shortPathName } from "@/lib/utils";
import type { CareerPath, Profile } from "@/types";
import { isTestAccount, postJson, type TabActions } from "./shared";
import styles from "../admin.module.css";

export default function MembersTab({ members, careerPaths, pathsByMember, adminId, onError, onSuccess, onChanged }: TabActions & {
  members: Profile[]; careerPaths: CareerPath[]; pathsByMember: Map<string, CareerPath[]>; adminId: string;
}) {
  const [q, setQ] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === "admin").length;
  const testAccounts = members.filter((m) => isTestAccount(m.email));

  const filtered = members.filter((m) => {
    if (path && !(pathsByMember.get(m.id) ?? []).some((c) => c.id === path)) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [m.full_name, m.email, m.phone, m.profession, m.area_of_residence].some((v) => v?.toLowerCase().includes(s));
  });

  async function changeRole(m: Profile, role: "admin" | "member") {
    const name = m.full_name || m.email;
    const self = m.id === adminId;
    if (role === "member" && adminCount <= 1) {
      onError("You can't remove the last admin. Make someone else an admin first.");
      return;
    }
    const message = role === "admin"
      ? `Make ${name} an admin?\n\nAdmins can see every member's details, post and remove jobs, manage communities and remove posts.`
      : self
        ? "Remove your own admin access?\n\nYou'll lose access to this admin dashboard straight away. Another admin would have to give it back."
        : `Remove admin access from ${name}?\n\nThey'll stay a member but won't be able to use this admin dashboard.`;
    if (!confirm(message)) return;

    setBusy(m.id); onError("");
    const res = await postJson<{ ok: true; changed: boolean }>("/api/admin/members/role", { memberId: m.id, role });
    setBusy(null);
    if (!res.ok) return onError(`Couldn't change ${name}'s access: ${res.error}`);
    if (self && role === "member") {
      window.location.assign("/dashboard");
      return;
    }
    onSuccess(role === "admin" ? `${name} is now an admin.` : `${name} is no longer an admin.`);
    onChanged();
  }

  function exportCsv() {
    const headers = ["Full name", "Email", "Phone", "Area of residence", "Parish / unit", "Profession",
      "Employment status", "Preferred work mode", "Career goal", "Career paths", "Consents to updates", "Role", "Joined"];
    const rows = filtered.map((m) => [
      m.full_name, m.email, m.phone, m.area_of_residence, m.parish_unit, m.profession,
      m.employment_status ? EMPLOYMENT_STATUS_LABELS[m.employment_status] : "",
      m.preferred_work_mode ? WORK_MODE_LABELS[m.preferred_work_mode] : "",
      m.career_goal ? CAREER_GOAL_LABELS[m.career_goal] : "",
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
      <p className="small muted">
        Member data is personal information. Only export what you need, and don&apos;t share the file outside the YPC team.
        {" "}There {adminCount === 1 ? "is 1 admin" : `are ${adminCount} admins`}.
      </p>

      {filtered.length === 0 ? (
        <div className="empty">{members.length === 0 ? "No members have registered yet." : "No members match your search."}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Area</th><th scope="col">Work</th>
                <th scope="col">Career goal</th><th scope="col">Career paths</th><th scope="col">Updates</th>
                <th scope="col">Joined</th><th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isAdmin = m.role === "admin";
                const name = m.full_name || m.email;
                return (
                  <tr key={m.id}>
                    <td data-label="Name">
                      <span>
                        <strong>{m.full_name || "—"}</strong>
                        {isAdmin && <> <span className="status admin">Admin</span></>}
                        {isTestAccount(m.email) && <> <span className="status off">Test account</span></>}
                      </span>
                    </td>
                    <td data-label="Contact"><span style={{ overflowWrap: "anywhere" }}>{m.email}<br />{m.phone ?? ""}</span></td>
                    <td data-label="Area">{m.area_of_residence ?? "—"}{m.parish_unit ? ` · ${m.parish_unit}` : ""}</td>
                    <td data-label="Work">
                      <span>
                        {m.profession ?? "—"}
                        <span className="small muted" style={{ display: "block" }}>
                          {[
                            m.employment_status && EMPLOYMENT_STATUS_LABELS[m.employment_status],
                            m.preferred_work_mode && WORK_MODE_LABELS[m.preferred_work_mode],
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </td>
                    <td data-label="Career goal">{m.career_goal ? CAREER_GOAL_LABELS[m.career_goal] ?? "—" : "—"}</td>
                    <td data-label="Paths">{(pathsByMember.get(m.id) ?? []).map((c) => shortPathName(c.name)).join(", ") || "—"}</td>
                    <td data-label="Updates">{m.consent_updates ? "Yes" : "No"}</td>
                    <td data-label="Joined">{formatDate(m.created_at)}</td>
                    <td data-label="Access">
                      {isAdmin ? (
                        <>
                        <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => changeRole(m, "member")}
                          disabled={!!busy || adminCount <= 1}
                          title={adminCount <= 1 ? "The club needs at least one admin" : undefined}
                          aria-label={`Remove admin access from ${name}`}>
                          {busy === m.id ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ShieldOff size={16} aria-hidden="true" />}
                          {adminCount <= 1 ? " Only admin" : " Remove admin"}
                        </button>
                        {adminCount <= 1 && <span className="hint" style={{ display: "block", marginTop: 4 }}>The club needs at least one admin.</span>}
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeRole(m, "admin")} disabled={!!busy}
                          aria-label={`Make ${name} an admin`}>
                          {busy === m.id ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />} Make admin
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {testAccounts.length > 0 && (
        <section className="card" aria-labelledby="test-accounts-h">
          <h2 id="test-accounts-h" className="title-sm row" style={{ gap: 8, marginBottom: 4 }}>
            <FlaskConical size={20} aria-hidden="true" /> Test accounts ({testAccounts.length})
          </h2>
          <p className="small ink-2" style={{ marginBottom: 10 }}>
            These accounts were made for testing (their emails end in <strong>@example.test</strong>). They aren&apos;t real members.
            Delete them before launch so they don&apos;t show up in counts or exports.
          </p>
          <ul className={styles.managerList} style={{ marginBottom: 12 }}>
            {testAccounts.map((m) => (
              <li key={m.id}>
                <span className="small" style={{ overflowWrap: "anywhere" }}>{m.email}</span>
                {m.role === "admin" && <span className="status admin">Admin</span>}
              </li>
            ))}
          </ul>
          <p className="small" style={{ fontWeight: 600 }}>How to delete them</p>
          <ol className="small ink-2" style={{ paddingLeft: 20, marginTop: 4 }}>
            <li>Open the Supabase dashboard for this project and go to <strong>Authentication → Users</strong>.</li>
            <li>Search for <strong>example.test</strong>.</li>
            <li>Tick each test account, then choose <strong>Delete users</strong>. Their profile and any test posts are removed with them.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 8 }}>This dashboard never deletes accounts itself — that stays a deliberate step in Supabase.</p>
        </section>
      )}
    </div>
  );
}
