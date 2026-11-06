"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase, CalendarDays, MessageSquare } from "lucide-react";
import { eventWhen } from "@/components/news/news";
import styles from "./Welcome.module.css";

export interface SinceThread {
  id: string;
  title: string;
  href: string;
}

export interface SinceData {
  /** created_at of recent live jobs on the member's career paths (newest first, capped). */
  jobTimes: string[];
  /** True when jobTimes hit the query cap, so the count may be higher. */
  jobsCapped: boolean;
  jobsHref: string;
  /** Visible replies by other members on the member's own discussions. */
  replies: { threadId: string; createdAt: string }[];
  threads: SinceThread[];
  nextEvent: { title: string; startsAt: string | null; endsAt: string | null } | null;
}

/** Device-local "last visit" (no schema change). Per member, so a shared phone works. */
const lastVisitKey = (userId: string) => `lp9ypc:last-visit:${userId}`;
/** The baseline for this browsing session, so a reload doesn't wipe the strip. */
const baselineKey = (userId: string) => `lp9ypc:visit-baseline:${userId}`;

/** Reads the previous visit (null on a first visit) and records this one. */
function readBaseline(userId: string): number | null {
  try {
    const kept = window.sessionStorage.getItem(baselineKey(userId));
    let baseline: string;
    if (kept !== null) {
      baseline = kept;
    } else {
      baseline = window.localStorage.getItem(lastVisitKey(userId)) ?? "none";
      window.sessionStorage.setItem(baselineKey(userId), baseline);
    }
    window.localStorage.setItem(lastVisitKey(userId), new Date().toISOString());
    const t = baseline === "none" ? NaN : Date.parse(baseline);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null; // Storage blocked: behave like a first visit.
  }
}

const after = (iso: string, since: number) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > since;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Since you were last here": new jobs on the member's paths, replies to their
 * discussions, and the next event. Renders nothing on a first visit (or before
 * the browser has checked), so the server HTML never guesses.
 */
export default function SinceLastVisit({ userId, data }: { userId: string; data: SinceData }) {
  const [since, setSince] = useState<number | null>(null);

  useEffect(() => {
    setSince(readBaseline(userId));
  }, [userId]);

  if (since === null) return null;

  const newJobs = data.jobTimes.filter((t) => after(t, since)).length;
  const jobsLabel =
    data.jobsCapped && newJobs === data.jobTimes.length ? `${newJobs}+ new jobs` : plural(newJobs, "new job", "new jobs");

  const perThread = new Map<string, { count: number; latest: number }>();
  for (const r of data.replies) {
    if (!after(r.createdAt, since)) continue;
    const cur = perThread.get(r.threadId) ?? { count: 0, latest: 0 };
    perThread.set(r.threadId, { count: cur.count + 1, latest: Math.max(cur.latest, Date.parse(r.createdAt)) });
  }
  const threadById = new Map(data.threads.map((t) => [t.id, t]));
  const replyItems = [...perThread.entries()]
    .filter(([id]) => threadById.has(id))
    .sort((a, b) => b[1].latest - a[1].latest)
    .slice(0, 3)
    .map(([id, v]) => ({ thread: threadById.get(id)!, count: v.count }));

  const when = data.nextEvent ? eventWhen(data.nextEvent.startsAt, data.nextEvent.endsAt) : null;

  if (newJobs === 0 && replyItems.length === 0 && !data.nextEvent) return null;

  return (
    <section className={styles.since} aria-labelledby="since-h">
      <h2 id="since-h" className={styles.sinceTitle}>Since you were last here</h2>
      <ul className={styles.sinceList}>
        {newJobs > 0 && (
          <li>
            <Link href={data.jobsHref} className={styles.sinceLink}>
              <Briefcase size={18} aria-hidden="true" />
              <span className={styles.sinceText}>{jobsLabel} on your career paths</span>
            </Link>
          </li>
        )}
        {replyItems.map(({ thread, count }) => (
          <li key={thread.id}>
            <Link href={thread.href} className={styles.sinceLink}>
              <MessageSquare size={18} aria-hidden="true" />
              <span className={styles.sinceText}>
                {plural(count, "new reply", "new replies")} on &ldquo;{thread.title}&rdquo;
              </span>
            </Link>
          </li>
        ))}
        {data.nextEvent && (
          <li>
            <Link href="/news" className={styles.sinceLink}>
              <CalendarDays size={18} aria-hidden="true" />
              <span className={styles.sinceText}>
                Next event: {data.nextEvent.title}
                {when ? <>, <time dateTime={when.iso}>{when.day} {when.month}</time> · {when.line}</> : null}
              </span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
