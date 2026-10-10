/**
 * Daily link checker (Phase 3.2, builder C). No AI involved.
 *
 * FLAG ONLY: it never hides, edits or deletes a job or an announcement. It
 *   1. checks the Apply link of active, approved jobs not checked in 20 h
 *      (oldest first, ≤40 per run, ≤4 at once, ≤8 s each) with the SSRF-safe
 *      fetch (HEAD, falling back to GET; ≤3 redirects; bot user agent);
 *   2. keeps a consecutive-failure count in link_health — only not_found,
 *      redirect_home and domain_gone (DNS ENOTFOUND) count; timeouts,
 *      401/403/429, 5xx, too many redirects, SSRF-blocked, temporary DNS
 *      failures and network errors are recorded but never counted (flaky
 *      sites); ok resets the count;
 *   3. files one open "found by the assistant" feedback item when a job's
 *      count reaches 2, and one wrong_info item for active jobs whose closing
 *      date (Lagos) has passed and active events that ended over 24 h ago.
 *
 * Decisions live in pure functions (classification, the two-strike rule,
 * what is due, the feedback rows) with injected fetch and clock; the
 * database I/O in runLinkCheck() is kept thin. Server-only (service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultFetchDeps, safeFetchText, type SafeFetchDeps, type SafeFetchResult } from "./safe-fetch.ts";
import { lagosToday } from "./job-validate.ts";

export const MAX_JOBS_PER_RUN = 40;
export const CHECK_CONCURRENCY = 4;
export const LINK_TIMEOUT_MS = 8_000;
export const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;
export const EVENT_GRACE_MS = 24 * 60 * 60 * 1000;
export const STRIKES_TO_FLAG = 2;

export type LinkStatus = "ok" | "not_found" | "redirect_home" | "domain_gone" | "timeout" | "blocked" | "error";

export interface LinkCheckResult {
  status: LinkStatus;
  http: number | null;
}

export interface HealthRow {
  job_id: string;
  fail_count: number;
  last_status: string | null;
  last_http: number | null;
  checked_at: string;
}

export interface CheckableJob {
  id: string;
  application_link: string;
  deadline: string | null;
  is_active: boolean;
  review_status?: string | null;
}

export interface EventRow {
  id: string;
  kind: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface OpenAssistantItem {
  target_type: string | null;
  target_id: string | null;
  kind: string;
}

export interface FeedbackInsert {
  source: "assistant";
  kind: "link" | "wrong_info";
  target_type: "job" | "announcement";
  target_id: string;
  page_path: string;
  message: string;
}

// ── Wording (docs/phase-3-contracts.md, Phase 3.2 addendum — use exactly) ──
export const EVENT_PASSED_MESSAGE = "This event's date has passed but it's still showing.";
export const DEADLINE_PASSED_MESSAGE = "The closing date has passed but the job is still showing.";

export function linkFailureMessage(result: LinkCheckResult): string {
  const reason =
    result.status === "redirect_home"
      ? "it went to the site's home page"
      : result.status === "domain_gone"
        ? "the website's address no longer exists"
        : result.http
        ? `page not found, HTTP ${result.http}`
        : "page not found";
  return `The Apply link didn't open on 2 checks in a row (${reason}).`;
}

// ── Classification ─────────────────────────────────────────────────────────

function isRootPath(u: URL): boolean {
  return (u.pathname === "/" || u.pathname === "") && u.search === "";
}

/** Turns one safe-fetch result into a link status. */
export function classifyFetch(originalUrl: string, result: SafeFetchResult): LinkCheckResult {
  if (result.ok) {
    try {
      const original = new URL(originalUrl);
      const final = new URL(result.finalUrl);
      if (!isRootPath(original) && isRootPath(final)) return { status: "redirect_home", http: result.status };
    } catch {
      // unparseable — treat as a plain ok answer
    }
    return { status: "ok", http: result.status };
  }
  const http = result.status ?? null;
  switch (result.reason) {
    case "http_error":
      if (http === 404 || http === 410) return { status: "not_found", http };
      if (http === 403 || http === 429 || http === 401) return { status: "blocked", http };
      if (http !== null && http >= 300 && http < 400) return { status: "ok", http }; // 3xx without Location
      return { status: "error", http };
    case "timeout":
      return { status: "timeout", http };
    case "blocked_address":
      return { status: "blocked", http };
    case "dns_error":
      // ENOTFOUND = the domain doesn't exist (NXDOMAIN). EAI_AGAIN etc. are temporary.
      return { status: result.dnsCode === "ENOTFOUND" ? "domain_gone" : "error", http };
    default:
      // invalid_url, too_many_redirects, network_error, bad_content_type
      return { status: "error", http };
  }
}

/** Only a clear "this page is gone" counts as a strike. */
export function countsAsFailure(status: LinkStatus): boolean {
  return status === "not_found" || status === "redirect_home" || status === "domain_gone";
}

export interface LinkCheckDeps {
  fetchDeps?: SafeFetchDeps;
  now?: () => number;
}

/** HEAD first; GET (headers only) when HEAD gets an HTTP error or a network error. Shares one 8 s budget. */
export async function checkLink(url: string, deps: LinkCheckDeps = {}, budgetMs = LINK_TIMEOUT_MS): Promise<LinkCheckResult> {
  const fetchDeps = deps.fetchDeps ?? defaultFetchDeps;
  const now = deps.now ?? Date.now;
  const started = now();
  const head = await safeFetchText(url, { method: "HEAD", timeoutMs: budgetMs, accept: "*/*" }, fetchDeps);
  const headResult = classifyFetch(url, head);
  if (head.ok || (head.reason !== "http_error" && head.reason !== "network_error")) return headResult;
  const left = budgetMs - (now() - started);
  if (left < 500) return headResult;
  const get = await safeFetchText(url, { method: "GET", headersOnly: true, timeoutMs: left, accept: "*/*" }, fetchDeps);
  return classifyFetch(url, get);
}

// ── The two-strike rule ────────────────────────────────────────────────────

/** The next link_health row and whether this check reaches the flag threshold. */
export function nextHealth(
  jobId: string,
  prev: Pick<HealthRow, "fail_count"> | null | undefined,
  result: LinkCheckResult,
  nowMs: number,
): { row: HealthRow; flag: boolean } {
  const before = prev?.fail_count ?? 0;
  const fail_count = result.status === "ok" ? 0 : countsAsFailure(result.status) ? Math.min(before + 1, 32767) : before;
  return {
    row: { job_id: jobId, fail_count, last_status: result.status, last_http: result.http, checked_at: new Date(nowMs).toISOString() },
    flag: countsAsFailure(result.status) && fail_count >= STRIKES_TO_FLAG,
  };
}

// ── What is due ────────────────────────────────────────────────────────────

export function isLiveJob(job: CheckableJob): boolean {
  return job.is_active && (job.review_status ?? "approved") === "approved";
}

/** Active, approved jobs not checked in the last 20 h: never-checked first, then oldest check. */
export function selectDueJobs(
  jobs: CheckableJob[],
  health: Map<string, Pick<HealthRow, "checked_at">>,
  nowMs: number,
  limit = MAX_JOBS_PER_RUN,
): CheckableJob[] {
  const checkedAt = (id: string) => {
    const h = health.get(id);
    const t = h ? Date.parse(h.checked_at) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return jobs
    .filter((j) => isLiveJob(j) && typeof j.application_link === "string" && j.application_link.trim() !== "")
    .filter((j) => checkedAt(j.id) <= nowMs - RECHECK_AFTER_MS)
    .sort((a, b) => checkedAt(a.id) - checkedAt(b.id))
    .slice(0, limit);
}

/** The closing date (read as a Lagos calendar date) is before today in Lagos. */
export function deadlinePassed(deadline: string | null, nowMs: number): boolean {
  if (!deadline) return false;
  const day = deadline.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day < lagosToday(nowMs);
}

/** An active event whose coalesce(ends_at, starts_at) is more than 24 h ago. */
export function eventPassed(ev: EventRow, nowMs: number): boolean {
  if (!ev.is_active || ev.kind !== "event") return false;
  const end = ev.ends_at ?? ev.starts_at;
  if (!end) return false;
  const t = Date.parse(end);
  return Number.isFinite(t) && t < nowMs - EVENT_GRACE_MS;
}

// ── Feedback rows ──────────────────────────────────────────────────────────

const itemKey = (targetType: string | null, targetId: string | null, kind: string) => `${targetType}|${targetId}|${kind}`;

/** Every assistant item this run should file, minus the ones already open (and no duplicates within the run). */
export function buildFeedbackRows(input: {
  flaggedLinks: { jobId: string; result: LinkCheckResult }[];
  jobs: CheckableJob[];
  events: EventRow[];
  open: OpenAssistantItem[];
  nowMs: number;
}): FeedbackInsert[] {
  const seen = new Set(input.open.map((o) => itemKey(o.target_type, o.target_id, o.kind)));
  const rows: FeedbackInsert[] = [];
  const add = (row: FeedbackInsert) => {
    const key = itemKey(row.target_type, row.target_id, row.kind);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const f of input.flaggedLinks) {
    add({ source: "assistant", kind: "link", target_type: "job", target_id: f.jobId, page_path: `/jobs/${f.jobId}`, message: linkFailureMessage(f.result) });
  }
  for (const job of input.jobs) {
    if (isLiveJob(job) && deadlinePassed(job.deadline, input.nowMs)) {
      add({ source: "assistant", kind: "wrong_info", target_type: "job", target_id: job.id, page_path: `/jobs/${job.id}`, message: DEADLINE_PASSED_MESSAGE });
    }
  }
  for (const ev of input.events) {
    if (eventPassed(ev, input.nowMs)) {
      add({ source: "assistant", kind: "wrong_info", target_type: "announcement", target_id: ev.id, page_path: "/news", message: EVENT_PASSED_MESSAGE });
    }
  }
  return rows;
}

// ── Bounded-concurrency checking ───────────────────────────────────────────

/** Runs `check` over jobs with at most `concurrency` in flight; stops starting new ones after `deadline`. */
export async function checkJobs(
  jobs: CheckableJob[],
  check: (url: string) => Promise<LinkCheckResult>,
  opts: { concurrency?: number; deadline?: number; now?: () => number } = {},
): Promise<{ job: CheckableJob; result: LinkCheckResult }[]> {
  const concurrency = Math.max(1, opts.concurrency ?? CHECK_CONCURRENCY);
  const now = opts.now ?? Date.now;
  const out: { job: CheckableJob; result: LinkCheckResult }[] = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (opts.deadline !== undefined && now() >= opts.deadline) return;
      const i = next++;
      if (i >= jobs.length) return;
      let result: LinkCheckResult;
      try {
        result = await check(jobs[i].application_link);
      } catch {
        result = { status: "error", http: null };
      }
      out.push({ job: jobs[i], result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return out;
}

// ── Orchestration (thin database I/O) ──────────────────────────────────────

export interface LinkCheckRunResult {
  status: "ok" | "error" | "skipped";
  processed: number;
  message: string;
  details: Record<string, unknown>;
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST200"]);
const MISSING_TABLES_MESSAGE =
  "The feedback and link_health tables aren't set up yet. Apply migration 20261012120000_feedback.sql, then this will run.";

function dbFail(step: string, error: { code?: string }): LinkCheckRunResult {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    return { status: "skipped", processed: 0, message: MISSING_TABLES_MESSAGE, details: { step } };
  }
  return { status: "error", processed: 0, message: `Could not ${step} (${error.code ?? "unknown"}).`, details: { step } };
}

export async function runLinkCheck(
  admin: SupabaseClient,
  opts: { deadline?: number; now?: () => number; fetchDeps?: SafeFetchDeps } = {},
): Promise<LinkCheckRunResult> {
  const now = opts.now ?? Date.now;

  const jobsRes = await admin
    .from("jobs")
    .select("id, application_link, deadline, is_active, review_status")
    .eq("is_active", true)
    .eq("review_status", "approved")
    .limit(2000);
  if (jobsRes.error) return dbFail("read jobs", jobsRes.error);
  const jobs = (jobsRes.data ?? []) as CheckableJob[];

  const healthRes = await admin.from("link_health").select("job_id, fail_count, last_status, last_http, checked_at");
  if (healthRes.error) return dbFail("read link health", healthRes.error);
  const health = new Map(((healthRes.data ?? []) as HealthRow[]).map((h) => [h.job_id, h]));

  const openRes = await admin
    .from("feedback")
    .select("target_type, target_id, kind")
    .eq("source", "assistant")
    .in("status", ["new", "looking"]);
  if (openRes.error) return dbFail("read open assistant items", openRes.error);

  const eventsRes = await admin
    .from("announcements")
    .select("id, kind, is_active, starts_at, ends_at")
    .eq("is_active", true)
    .eq("kind", "event")
    .limit(2000);
  if (eventsRes.error) return dbFail("read events", eventsRes.error);

  // 1–2. Check due links and apply the two-strike rule.
  const due = selectDueJobs(jobs, health, now());
  const checked = await checkJobs(due, (url) => checkLink(url, { fetchDeps: opts.fetchDeps, now }), {
    deadline: opts.deadline,
    now,
  });
  const counts: Record<LinkStatus, number> = { ok: 0, not_found: 0, redirect_home: 0, domain_gone: 0, timeout: 0, blocked: 0, error: 0 };
  const healthRows: HealthRow[] = [];
  const flaggedLinks: { jobId: string; result: LinkCheckResult }[] = [];
  for (const { job, result } of checked) {
    counts[result.status]++;
    const { row, flag } = nextHealth(job.id, health.get(job.id), result, now());
    healthRows.push(row);
    if (flag) flaggedLinks.push({ jobId: job.id, result });
  }
  if (healthRows.length > 0) {
    const { error } = await admin.from("link_health").upsert(healthRows, { onConflict: "job_id" });
    if (error) return dbFail("save link health", error);
  }

  // 3. File assistant items (one open item per target and kind).
  const rows = buildFeedbackRows({
    flaggedLinks,
    jobs,
    events: (eventsRes.data ?? []) as EventRow[],
    open: (openRes.data ?? []) as OpenAssistantItem[],
    nowMs: now(),
  });
  let filed = 0;
  let insertErrors = 0;
  for (const row of rows) {
    const { error } = await admin.from("feedback").insert(row);
    if (!error) filed++;
    else if (error.code !== "23505") insertErrors++; // 23505: an open item already exists — fine
  }

  const details = {
    due: due.length,
    checked: checked.length,
    statuses: counts,
    flagged_links: flaggedLinks.length,
    items_filed: filed,
    insert_errors: insertErrors,
  };
  const message = `Checked ${checked.length} of ${due.length} due links; filed ${filed} item${filed === 1 ? "" : "s"}.`;
  return { status: insertErrors > 0 ? "error" : "ok", processed: checked.length, message, details };
}
