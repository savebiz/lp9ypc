/**
 * Weekly digest text for the club's WhatsApp groups (docs/stage-2-contracts.md, B).
 * Pure functions only (no imports), so the text can be checked without a browser.
 * Nothing here sends anything: an admin copies the text and Victor approves it
 * before it is posted.
 */

export const DIGEST_LIMIT = 3500;
export const DEFAULT_SITE_URL = "https://lp9ypc.vercel.app";

export interface DigestJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  career_path_id: string | null;
  relevance: number | null;
  created_at: string;
}
export interface DigestEvent { title: string; starts_at: string; location: string | null }
export interface DigestThread { id: string; title: string; community_slug: string }
export interface DigestPath { id: string; name: string }

export interface DigestInput {
  siteUrl: string;
  /** First day of the week, YYYY-MM-DD (Lagos). */
  since: string;
  jobs: DigestJob[];
  paths: DigestPath[];
  events: DigestEvent[];
  threads: DigestThread[];
  /** Optional parish attribution slug (already cleaned with parishSlug). */
  src?: string;
}

export interface DigestResult {
  text: string;
  /** Jobs shown per career path after trimming to fit the limit (3, 2 or 1). */
  perPath: number;
  jobsShown: number;
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Lagos is UTC+1 all year.
const DAY_MS = 86_400_000;

/** YYYY-MM-DD in Lagos for a moment in time. */
export function lagosDate(d: Date = new Date()): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Monday (YYYY-MM-DD) of the Lagos week containing `d`. */
export function lagosMonday(d: Date = new Date()): string {
  const day = new Date(`${lagosDate(d)}T00:00:00Z`);
  const back = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** Start and end (exclusive, 7 days later) of the week as ISO timestamps, Lagos midnight. */
export function weekWindow(since: string): { start: string; end: string } {
  const start = new Date(`${since}T00:00:00+01:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 7 * DAY_MS).toISOString() };
}

/** "2–8 Nov" or "28 Oct – 3 Nov". */
export function weekLabel(since: string): string {
  const a = new Date(`${since}T00:00:00Z`);
  const b = new Date(a.getTime() + 6 * DAY_MS);
  const mon = (d: Date) => d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return mon(a) === mon(b)
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${mon(b)}`
    : `${a.getUTCDate()} ${mon(a)} – ${b.getUTCDate()} ${mon(b)}`;
}

/** Parish name → slug for ?src= (lowercase letters, numbers and dashes, at most 40 characters). */
export function parishSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Strips WhatsApp formatting characters and line breaks from member- or site-written text. */
export function clean(text: string | null | undefined, max = 110): string {
  const t = (text ?? "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function link(siteUrl: string, path: string, src?: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}${path}${src ? `${path.includes("?") ? "&" : "?"}src=${src}` : ""}`;
}

/** "Sat 14 Nov, 10:00am" in Lagos time. */
export function eventWhen(iso: string): string {
  const d = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day}, ${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
}

const byBest = (a: DigestJob, b: DigestJob) =>
  (b.relevance ?? -1) - (a.relevance ?? -1) || b.created_at.localeCompare(a.created_at);

function build(input: DigestInput, perPath: number): { text: string; jobsShown: number } {
  const { siteUrl, src } = input;
  const lines: string[] = [];
  const total = input.jobs.length;
  let jobsShown = 0;

  lines.push(`*LP9 YPC — jobs this week* (${weekLabel(input.since)})`);
  lines.push("");

  const groups: { name: string; jobs: DigestJob[] }[] = [];
  for (const p of input.paths) {
    const jobs = input.jobs.filter((j) => j.career_path_id === p.id);
    if (jobs.length) groups.push({ name: p.name, jobs });
  }
  const known = new Set(input.paths.map((p) => p.id));
  const other = input.jobs.filter((j) => !j.career_path_id || !known.has(j.career_path_id));
  if (other.length) groups.push({ name: "Other roles", jobs: other });

  for (const g of groups) {
    lines.push(`*${clean(g.name, 60)}*`);
    for (const j of [...g.jobs].sort(byBest).slice(0, perPath)) {
      const where = clean(j.location, 40);
      lines.push(`• ${clean(j.title, 90)} — ${clean(j.company, 50)}${where ? ` (${where})` : ""}`);
      lines.push(link(siteUrl, `/jobs/${j.id}`, src));
      jobsShown++;
    }
    lines.push("");
  }

  if (total > 0) {
    lines.push(`${total} new job${total === 1 ? "" : "s"} this week — see them all: ${link(siteUrl, "/jobs", src)}`);
  } else {
    lines.push(`No new jobs were added this week. See every open job: ${link(siteUrl, "/jobs", src)}`);
  }

  if (input.events.length) {
    lines.push("");
    lines.push("*Coming up*");
    for (const e of input.events.slice(0, 2)) {
      const place = clean(e.location, 60);
      lines.push(`• ${clean(e.title, 90)} — ${eventWhen(e.starts_at)}${place ? `, ${place}` : ""}`);
    }
    lines.push(`Details: ${link(siteUrl, "/news", src)}`);
  }

  if (input.threads.length) {
    lines.push("");
    lines.push("*In the community this week*");
    for (const t of input.threads.slice(0, 3)) {
      lines.push(`• ${clean(t.title, 90)}`);
      lines.push(link(siteUrl, `/community/${t.community_slug}/t/${t.id}`, src));
    }
  }

  lines.push("");
  lines.push(`New to YPC? Join in a few minutes: ${link(siteUrl, "/register", src)}`);
  return { text: lines.join("\n"), jobsShown };
}

/** Builds the digest, showing up to 3 jobs per path and fewer if needed to stay under the limit. */
export function buildDigest(input: DigestInput): DigestResult {
  let last = { text: "", jobsShown: 0 };
  for (const perPath of [3, 2, 1]) {
    last = build(input, perPath);
    if (last.text.length <= DIGEST_LIMIT || perPath === 1) return { ...last, perPath };
  }
  return { ...last, perPath: 1 };
}
