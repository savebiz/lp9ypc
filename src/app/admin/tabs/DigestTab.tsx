"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Info, Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CareerPath } from "@/types";
import { friendlyDbError } from "./shared";
import {
  DEFAULT_SITE_URL, DIGEST_LIMIT, buildDigest, isDateStr, lagosDate, lagosMonday, parishSlug, weekLabel, weekWindow,
  type DigestEvent, type DigestJob, type DigestThread,
} from "./digestText";
import styles from "../admin.module.css";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

type DbError = { code?: string; message?: string } | null;
const isMissingColumn = (e: DbError) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(e.message ?? ""));

interface WeekData { since: string; jobs: DigestJob[]; events: DigestEvent[]; threads: DigestThread[] }

/** Reads the week's new live jobs, the next 2 events and the busiest discussions, as the signed-in admin (RLS). */
async function loadWeek(since: string): Promise<{ ok: true; data: WeekData } | { ok: false; error: string }> {
  const supabase = createClient();
  const { start, end } = weekWindow(since);
  const today = lagosDate();

  // "New this week" = approved this week (reviewed_at), or posted this week by an admin (created_at).
  type Row = DigestJob & { deadline: string | null };
  const jobsQuery = (withReview: boolean) => {
    const cols = `id, title, company, location, career_path_id, created_at, deadline${withReview ? ", relevance" : ""}`;
    const q = supabase.from("jobs").select(cols).eq("review_status", "approved").eq("is_active", true);
    return (withReview
      ? q.or(`and(reviewed_at.gte.${start},reviewed_at.lt.${end}),and(created_at.gte.${start},created_at.lt.${end})`)
      : q.gte("created_at", start).lt("created_at", end)
    ).order("created_at", { ascending: false }).limit(1000);
  };
  let jobsRes = await jobsQuery(true);
  if (jobsRes.error && isMissingColumn(jobsRes.error)) jobsRes = await jobsQuery(false);
  if (jobsRes.error) return { ok: false, error: friendlyDbError("load this week's jobs", jobsRes.error) };
  const jobs = ((jobsRes.data ?? []) as unknown as Row[])
    .filter((j) => !j.deadline || j.deadline >= today)
    .map((j) => ({ ...j, relevance: typeof j.relevance === "number" ? j.relevance : null }));

  const [eventsRes, threadsRes] = await Promise.all([
    supabase.from("announcements").select("title, starts_at, location")
      .eq("kind", "event").eq("is_active", true).gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }).limit(2),
    // Titles only: the post text is never read for the digest.
    supabase.from("threads").select("id, title, reply_count, like_count, communities(slug, is_active)")
      .eq("status", "visible").eq("needs_review", false)
      .gte("last_activity_at", start).lt("last_activity_at", end)
      .order("last_activity_at", { ascending: false }).limit(50),
  ]);
  if (eventsRes.error) return { ok: false, error: friendlyDbError("load upcoming events", eventsRes.error) };
  if (threadsRes.error) return { ok: false, error: friendlyDbError("load this week's discussions", threadsRes.error) };

  type ThreadRow = { id: string; title: string; reply_count: number; like_count: number | null; communities: { slug: string; is_active: boolean } | null };
  const threads = ((threadsRes.data ?? []) as unknown as ThreadRow[])
    .filter((t) => t.communities?.is_active && t.communities.slug)
    .sort((a, b) => (b.reply_count + (b.like_count ?? 0)) - (a.reply_count + (a.like_count ?? 0)))
    .slice(0, 3)
    .map((t) => ({ id: t.id, title: t.title, community_slug: t.communities!.slug }));

  return {
    ok: true,
    data: {
      since,
      jobs,
      events: ((eventsRes.data ?? []) as DigestEvent[]).filter((e) => !!e.starts_at),
      threads,
    },
  };
}

/** Builds the WhatsApp text for the week. Nothing is sent from here. */
export default function DigestTab({ careerPaths }: { careerPaths: CareerPath[] }) {
  const [since, setSince] = useState(() => lagosMonday());
  const [parish, setParish] = useState("");
  const [week, setWeek] = useState<WeekData | null>(null);
  const [text, setText] = useState("");
  const [generated, setGenerated] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const src = parishSlug(parish);
  const sinceOk = isDateStr(since);

  const make = useCallback(async (askFirst: boolean, fresh = false) => {
    if (!isDateStr(since)) { setError("Choose the first day of the week."); return; }
    if (askFirst && text && text !== generated && !window.confirm("Replace your edited text with a fresh digest? Your edits will be lost.")) return;
    setLoading(true); setError(""); setCopied(false);
    const res = !fresh && week?.since === since ? { ok: true as const, data: week } : await loadWeek(since);
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setWeek(res.data);
    const out = buildDigest({
      siteUrl: SITE_URL, since, src: src || undefined,
      jobs: res.data.jobs, paths: careerPaths.map((p) => ({ id: p.id, name: p.name })),
      events: res.data.events, threads: res.data.threads,
    });
    setText(out.text);
    setGenerated(out.text);
    const n = res.data.jobs.length;
    setSummary(
      `${n} new job${n === 1 ? "" : "s"} (${out.jobsShown} listed, up to ${out.perPath} per career path), ` +
      `${res.data.events.length} upcoming event${res.data.events.length === 1 ? "" : "s"}, ` +
      `${res.data.threads.length} discussion${res.data.threads.length === 1 ? "" : "s"}.` +
      (out.perPath < 3 ? " Fewer jobs per path are shown so the message stays short enough." : ""),
    );
  }, [since, src, careerPaths, text, generated, week]);

  // Make this week's digest when the tab opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { make(false); }, []);

  async function copy() {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Older phones: select the text so the admin can copy it by hand.
      boxRef.current?.focus();
      boxRef.current?.select();
      setError("Your browser wouldn't copy automatically. The text is selected: use your phone's Copy option.");
    }
  }


  const count = text.length;
  const over = count > DIGEST_LIMIT;

  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="digest-h">
        <h2 id="digest-h" className="title-sm" style={{ marginBottom: 4 }}>Weekly digest</h2>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Makes a ready-to-paste message for the club&apos;s WhatsApp groups: this week&apos;s new jobs, the next events and
          the busiest discussions. Nothing is sent from here: copy the text and share it yourself.
        </p>
        <div className="alert alert-info" role="note" style={{ marginBottom: 16 }}>
          <Info size={18} aria-hidden="true" /> <span>Victor approves the text before it goes to the WhatsApp groups.</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="digest-since">Week starting</label>
            <input id="digest-since" type="date" className="input" value={since} max={lagosDate()}
              onChange={(e) => setSince(e.target.value)} aria-describedby="digest-since-hint" />
            <span className="hint" id="digest-since-hint">
              {sinceOk ? `Covers ${weekLabel(since)} (Lagos time). Normally a Monday.` : "Choose a date."}
            </span>
          </div>
          <div className="field">
            <label className="label" htmlFor="digest-parish">Parish <span className="opt">(optional)</span></label>
            <input id="digest-parish" className="input" maxLength={80} value={parish} placeholder="e.g. Victory Parish"
              onChange={(e) => setParish(e.target.value)} aria-describedby="digest-parish-hint" />
            <span className="hint" id="digest-parish-hint">
              {src ? `Every link will end in ?src=${src} so we can see which group the visits came from. Nothing is stored yet.`
                : "Adds a tag to the links so we can see which parish group the visits came from."}
            </span>
          </div>
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-solid" onClick={() => make(true)} disabled={loading || !sinceOk}>
            {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {" "}Make the digest
          </button>
          {week && (
            <button type="button" className="btn btn-ghost" onClick={() => make(true, true)} disabled={loading}>
              Get the latest jobs and posts
            </button>
          )}
        </div>
        {error && <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </section>

      {text && (
        <section className="card" aria-labelledby="digest-text-h">
          <h2 id="digest-text-h" className="title-sm" style={{ marginBottom: 4 }}>Message to copy</h2>
          <p className="small muted" style={{ marginBottom: 8 }} role="status">{summary}</p>
          <p className="small muted" style={{ marginBottom: 12 }}>
            You can edit the text below before copying. Words between *stars* show in bold on WhatsApp.
          </p>
          <label className="label" htmlFor="digest-text">Digest text</label>
          <textarea id="digest-text" ref={boxRef} className="input" rows={18} value={text}
            onChange={(e) => { setText(e.target.value); setCopied(false); }}
            style={{ width: "100%", fontSize: 16, lineHeight: 1.45, fontFamily: "inherit", whiteSpace: "pre-wrap" }}
            aria-describedby="digest-count" />
          <p id="digest-count" className={`small ${over ? styles.warn : "muted"}`} aria-live="polite" style={{ marginTop: 6 }}>
            {count.toLocaleString("en-GB")} / {DIGEST_LIMIT.toLocaleString("en-GB")} characters
            {over ? " — too long for one easy-to-read message. Remove a few lines before copying." : ""}
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-solid" onClick={copy} style={{ minHeight: 44 }}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? " Copied" : " Copy"}
            </button>
            {text !== generated && (
              <button type="button" className="btn btn-ghost" onClick={() => { setText(generated); setCopied(false); }}>Undo my edits</button>
            )}
          </div>
          {copied && <p className="small muted" role="status" style={{ marginTop: 8 }}>Copied. Send it to Victor to approve before posting.</p>}
        </section>
      )}
    </div>
  );
}
