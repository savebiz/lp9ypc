"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Stat } from "./shared";

interface WeekRow { week_start: string; applying_members: number; member_taps: number; visitor_taps: number }

/** Codes meaning "apply_weekly isn't set up yet / not allowed in this session": hide quietly. */
const QUIET = new Set(["42P01", "42883", "PGRST202", "PGRST205", "42501"]);

/**
 * "Weekly applying members" from apply_weekly(8) (migration 20261106120000).
 * Totals only — admins never see individual taps. Hidden if the function is missing.
 */
export default function WeeklyApplyTiles() {
  const [weeks, setWeeks] = useState<WeekRow[] | null>(null);

  useEffect(() => {
    let live = true;
    createClient().rpc("apply_weekly", { p_weeks: 8 }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        if (!QUIET.has(error.code ?? "")) console.warn(`[admin] weekly applying members failed (${error.code ?? "unknown"})`);
        return;
      }
      const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        week_start: String(r.week_start ?? ""),
        applying_members: Number(r.applying_members ?? 0),
        member_taps: Number(r.member_taps ?? 0),
        visitor_taps: Number(r.visitor_taps ?? 0),
      }));
      if (rows.length) setWeeks(rows);
    }, () => { /* network problem: leave the tiles hidden */ });
    return () => { live = false; };
  }, []);

  if (!weeks) return null;
  const now = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;

  return (
    <section className="card" aria-labelledby="applying-h">
      <h2 id="applying-h" className="title-sm" style={{ marginBottom: 4 }}>Weekly applying members</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Members who tapped Apply on at least one job (weeks start on Monday, Lagos time). Totals only.
      </p>
      <div className="stats">
        <Stat n={now.applying_members} label="Applying members this week" />
        {prev && <Stat n={prev.applying_members} label="Last week" />}
        <Stat n={now.member_taps} label="Apply taps by members this week" />
        <Stat n={now.visitor_taps} label="Apply taps by visitors this week" />
      </div>
      <Sparkline weeks={weeks} />
    </section>
  );
}

/** Small inline chart of applying members per week (no chart library). */
function Sparkline({ weeks }: { weeks: WeekRow[] }) {
  const w = 280, h = 56, pad = 6;
  const max = Math.max(1, ...weeks.map((r) => r.applying_members));
  const step = weeks.length > 1 ? (w - pad * 2) / (weeks.length - 1) : 0;
  const pts = weeks.map((r, i) => [pad + i * step, h - pad - (r.applying_members / max) * (h - pad * 2)] as const);
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const label = `Applying members over the last ${weeks.length} weeks, oldest first: ${weeks.map((r) => r.applying_members).join(", ")}.`;
  return (
    <figure style={{ margin: "12px 0 0" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, display: "block" }} role="img" aria-label={label}>
        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => <circle key={weeks[i].week_start} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2} fill="var(--blue)" />)}
      </svg>
      <figcaption className="small muted">Last {weeks.length} weeks</figcaption>
    </figure>
  );
}
