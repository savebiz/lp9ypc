"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { CAREER_GOAL_LABELS } from "@/lib/career-match";
import { EMPLOYMENT_STATUS_LABELS, WORK_MODE_LABELS, csvCell, formatDate, shortPathName } from "@/lib/utils";
import type { CareerPath, Profile } from "@/types";

export default function MembersTab({ members, careerPaths, pathsByMember }: {
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
                    <span>
                      {m.profession ?? "—"}
                      <span className="small muted" style={{ display: "block" }}>
                        {[
                          m.employment_status && EMPLOYMENT_STATUS_LABELS[m.employment_status],
                          m.preferred_work_mode && WORK_MODE_LABELS[m.preferred_work_mode],
                          m.career_goal && CAREER_GOAL_LABELS[m.career_goal],
                        ].filter(Boolean).join(" · ")}
                      </span>
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
