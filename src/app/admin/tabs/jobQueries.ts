/**
 * Paged job reads for the admin Review queue and Jobs tab (docs/stage-1-contracts.md, B).
 * Runs in the browser as the signed-in admin: row-level security lets admins
 * read every job. Only the columns the rows show are selected; the full job is
 * fetched when an admin opens it in the editor.
 *
 * Migration 7 (relevance / reject_reason / reviewed_at) may not be applied yet:
 * on "column does not exist" we retry without those columns and remember it.
 */
import { createClient } from "@/lib/supabase/client";
import { hostnameOf, safeHttpUrl } from "@/lib/utils";
import type { Job, JobRejectReason } from "@/types";
import { friendlyDbError } from "./shared";

export const PAGE_SIZE = 20;

export const REJECT_REASON_LABELS: Record<JobRejectReason, string> = {
  expired: "Expired",
  not_eligible: "Not open to Nigeria",
  duplicate: "Duplicate",
  irrelevant: "Not relevant",
  broken_link: "Broken link",
  other: "Other",
};

type PathRef = { name: string; slug: string } | null;

/** One compact row in the Review queue. */
export type ReviewRow = Pick<Job, "id" | "title" | "company" | "location" | "source_id" | "career_path_id" | "application_link" | "created_at" | "deadline"> & {
  relevance: number | null;
  reject_reason: JobRejectReason | null;
  reviewed_at: string | null;
  career_paths: PathRef;
};

/** One row in the Jobs tab (approved jobs, live or archived). */
export type ListedRow = Pick<Job, "id" | "title" | "company" | "work_mode" | "engagement_type" | "deadline" | "created_at" | "application_link" | "is_active" | "source_id" | "source_page_url"> & {
  career_paths: PathRef;
};

export interface ReviewFilters {
  /** "" = every source */
  source: string;
  /** "" = every path, "none" = no career path yet */
  path: string;
  /** 0 = any score */
  minScore: number;
  /** Only jobs whose Apply link goes to a specific page */
  linkOk: boolean;
}

export const NO_FILTERS: ReviewFilters = { source: "", path: "", minScore: 0, linkOk: false };

type DbError = { code?: string; message?: string } | null;
type Paged<T> = { ok: true; rows: T[]; total: number; page: number } | { ok: false; error: string };

const BASE_REVIEW_COLS = "id, title, company, location, source_id, career_path_id, application_link, created_at, deadline, career_paths(name, slug)";
const LISTED_COLS = "id, title, company, work_mode, engagement_type, deadline, created_at, application_link, is_active, source_id, source_page_url, career_paths(name, slug)";

/** Becomes false the first time the database says the migration-7 columns are missing. */
let reviewColumns = true;
export const hasReviewColumns = () => reviewColumns;

function isMissingColumn(error: DbError): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? "");
}
/** PostgREST "range not satisfiable": the page is past the end (e.g. after approving the last rows). */
const isPastEnd = (error: DbError) => error?.code === "PGRST103" || /range not satisfiable/i.test(error?.message ?? "");

/**
 * "Apply link looks OK": a real web link to a specific page, not just a
 * site's home page. Same rule as the "Apply link looks OK" filter below.
 */
export function applyLinkLooksOk(link: string | null | undefined): boolean {
  const safe = safeHttpUrl(link);
  if (!safe) return false;
  try {
    const u = new URL(safe);
    return u.pathname.length > 1 || u.search.length > 1;
  } catch {
    return false;
  }
}
export const linkDomain = (link: string | null | undefined) => {
  const safe = safeHttpUrl(link);
  return safe ? hostnameOf(safe) : "";
};

function normaliseReview(r: Record<string, unknown>): ReviewRow {
  const row = r as unknown as ReviewRow;
  return {
    ...row,
    relevance: typeof r.relevance === "number" ? r.relevance : null,
    reject_reason: (r.reject_reason as JobRejectReason | null | undefined) ?? null,
    reviewed_at: (r.reviewed_at as string | null | undefined) ?? null,
    career_paths: (r.career_paths as PathRef) ?? null,
  };
}

/** Pending jobs, 20 a page, best score first then newest. */
export async function fetchReviewPage(page: number, f: ReviewFilters): Promise<Paged<ReviewRow> & { scored?: boolean }> {
  const supabase = createClient();
  const build = (withScore: boolean, p: number) => {
    let q = supabase.from("jobs")
      .select(withScore ? `${BASE_REVIEW_COLS}, relevance` : BASE_REVIEW_COLS, { count: "exact" })
      .eq("review_status", "pending");
    if (f.source) q = q.eq("source_id", f.source);
    if (f.path === "none") q = q.is("career_path_id", null);
    else if (f.path) q = q.eq("career_path_id", f.path);
    if (withScore && f.minScore > 0) q = q.gte("relevance", f.minScore);
    // http(s)://host/<at least one character>. The database already refuses non-web links.
    if (f.linkOk) q = q.ilike("application_link", "http%://%/_%");
    if (withScore) q = q.order("relevance", { ascending: false, nullsFirst: false });
    return q.order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);
  };

  let withScore = reviewColumns;
  let current = Math.max(0, page);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error, count } = await build(withScore, current);
    if (error && withScore && isMissingColumn(error)) {
      reviewColumns = false;
      withScore = false;
      continue;
    }
    if (error && isPastEnd(error) && current > 0) {
      const total = await countPending(f, withScore);
      current = total > 0 ? Math.ceil(total / PAGE_SIZE) - 1 : 0;
      continue;
    }
    if (error) return { ok: false, error: friendlyDbError("load the review queue", error) };
    return {
      ok: true, page: current, total: count ?? 0, scored: withScore,
      rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(normaliseReview),
    };
  }
  return { ok: false, error: "Couldn't load the review queue. Refresh the page and try again." };
}

async function countPending(f: ReviewFilters, withScore: boolean): Promise<number> {
  let q = createClient().from("jobs").select("id", { count: "exact", head: true }).eq("review_status", "pending");
  if (f.source) q = q.eq("source_id", f.source);
  if (f.path === "none") q = q.is("career_path_id", null);
  else if (f.path) q = q.eq("career_path_id", f.path);
  if (withScore && f.minScore > 0) q = q.gte("relevance", f.minScore);
  if (f.linkOk) q = q.ilike("application_link", "http%://%/_%");
  const { count } = await q;
  return count ?? 0;
}

/** The 20 most recently rejected jobs (with the reason when known). */
export async function fetchRecentlyRejected(): Promise<{ ok: true; rows: ReviewRow[] } | { ok: false; error: string }> {
  const supabase = createClient();
  if (reviewColumns) {
    const { data, error } = await supabase.from("jobs")
      .select(`${BASE_REVIEW_COLS}, relevance, reject_reason, reviewed_at`)
      .eq("review_status", "rejected")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(20);
    if (!error) return { ok: true, rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(normaliseReview) };
    if (!isMissingColumn(error)) return { ok: false, error: friendlyDbError("load recently rejected jobs", error) };
    reviewColumns = false;
  }
  const { data, error } = await supabase.from("jobs").select(BASE_REVIEW_COLS)
    .eq("review_status", "rejected").order("updated_at", { ascending: false }).limit(20);
  if (error) return { ok: false, error: friendlyDbError("load recently rejected jobs", error) };
  return { ok: true, rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(normaliseReview) };
}

/** Removes characters that would break a PostgREST or() filter. */
function cleanSearch(term: string): string {
  return term.replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Approved jobs (live and archived), newest first, 20 a page, optional title/organisation search. */
export async function fetchListedPage(page: number, search: string): Promise<Paged<ListedRow>> {
  const supabase = createClient();
  const term = cleanSearch(search);
  let current = Math.max(0, page);
  for (let attempt = 0; attempt < 2; attempt++) {
    let q = supabase.from("jobs").select(LISTED_COLS, { count: "exact" }).eq("review_status", "approved");
    if (term) q = q.or(`title.ilike.*${term}*,company.ilike.*${term}*`);
    const { data, error, count } = await q
      .order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE - 1);
    if (error && isPastEnd(error) && current > 0) { current = 0; continue; }
    if (error) return { ok: false, error: friendlyDbError("load the job list", error) };
    return { ok: true, page: current, total: count ?? 0, rows: (data ?? []) as unknown as ListedRow[] };
  }
  return { ok: false, error: "Couldn't load the job list. Refresh the page and try again." };
}

/** The whole job, for the editor. */
export async function fetchJob(id: string): Promise<{ ok: true; job: Job } | { ok: false; error: string }> {
  const { data, error } = await createClient().from("jobs").select("*, career_paths(*)").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: friendlyDbError("open the job", error) };
  if (!data) return { ok: false, error: "We couldn't find that job. It may have been removed. Refresh the page." };
  return { ok: true, job: data as Job };
}

/** "3 days" / "today" from an ISO timestamp. */
export function ageLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}
