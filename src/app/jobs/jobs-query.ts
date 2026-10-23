import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_CARD_COLUMNS, type JobCardJob } from "@/components/jobs/card-data";

/**
 * One page of the public jobs list. Used by the server page (first page) and
 * by JobsClient in the browser ("Show more" and filter changes), so the search
 * and filters behave the same everywhere. RLS still decides what a visitor can
 * read; the filters here only narrow it.
 */

export const JOBS_PAGE_SIZE = 20;

export const WORK_MODES = ["remote", "onsite", "hybrid"] as const;
export const ENGAGEMENT_TYPES = ["full-time", "part-time", "contract", "internship", "graduate-trainee"] as const;
export const LEVELS = ["entry", "mid", "senior"] as const;

export interface JobFilters {
  q: string;
  /** career_paths.id values (empty = all paths). */
  pathIds: string[];
  workMode: string | null;
  type: string | null;
  level: string | null;
  location: string | null;
}

export interface JobsPageResult {
  jobs: JobCardJob[];
  /** Total matching jobs (loaded so far + still to load). */
  total: number;
  hasMore: boolean;
  error: boolean;
}

const SEARCH_FIELDS = ["title", "company", "location", "description"];

/**
 * Splits search text into at most 6 plain words. Anything that could break
 * PostgREST's filter syntax or act as a LIKE wildcard (quotes, backslashes,
 * commas, brackets, %, _, *) is turned into a space, so member input can only
 * ever be a literal word to look for.
 */
export function searchTerms(q: string): string[] {
  return q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&+#.'/-]/gu, " ")
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 6)
    .map((t) => t.slice(0, 40));
}

function oneOf(value: string | null | undefined, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

/**
 * Fetches the next page after `after` (the last job already shown), newest
 * first. Paging uses (created_at, id) as a cursor rather than an offset, so
 * jobs approved while a member is scrolling don't cause repeats or gaps.
 */
export async function fetchJobsPage(
  supabase: SupabaseClient,
  filters: JobFilters,
  after: Pick<JobCardJob, "id" | "created_at"> | null = null,
  alreadyLoaded = 0,
  signal?: AbortSignal,
): Promise<JobsPageResult> {
  let query = supabase
    .from("jobs")
    .select(JOB_CARD_COLUMNS, { count: "exact" })
    .eq("is_active", true)
    // RLS already hides pending jobs from members; this keeps admins' view of
    // /jobs the same as members' (scraped jobs wait as active + pending).
    .eq("review_status", "approved");

  const pathIds = filters.pathIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (pathIds.length) query = query.in("career_path_id", pathIds);
  const workMode = oneOf(filters.workMode, WORK_MODES);
  if (workMode) query = query.eq("work_mode", workMode);
  const type = oneOf(filters.type, ENGAGEMENT_TYPES);
  if (type) query = query.eq("engagement_type", type);
  const level = oneOf(filters.level, LEVELS);
  if (level) query = query.eq("experience_level", level);
  if (filters.location) query = query.eq("location", filters.location.slice(0, 200));

  // Every word must appear somewhere in the title, organisation, location or description.
  for (const t of searchTerms(filters.q)) {
    query = query.or(SEARCH_FIELDS.map((c) => `${c}.ilike."%${t}%"`).join(","));
  }

  if (after) {
    const c = after.created_at.replace(/"/g, "");
    const id = after.id.replace(/[^0-9a-f-]/gi, "");
    query = query.or(`created_at.lt."${c}",and(created_at.eq."${c}",id.lt.${id})`);
  }

  query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(JOBS_PAGE_SIZE);
  if (signal) query = query.abortSignal(signal);

  const { data, count, error } = await query;
  if (error) return { jobs: [], total: alreadyLoaded, hasMore: false, error: true };

  const jobs = (data ?? []) as unknown as JobCardJob[];
  // With the cursor, `count` is how many match from here on (this page included).
  const remaining = count ?? jobs.length;
  return {
    jobs,
    total: alreadyLoaded + remaining,
    hasMore: count === null ? jobs.length === JOBS_PAGE_SIZE : remaining > jobs.length,
    error: false,
  };
}
