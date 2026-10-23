/**
 * Job relevance (Stage 1, docs/stage-1-contracts.md section A).
 *
 * scoreJob() rates a found job 0–100 for LP9 members (young professionals in
 * Lagos) and says whether it is open to applicants in Nigeria at all. The job
 * finder stores the score in jobs.relevance (the review queue sorts by it) and
 * sets jobs that are NOT open to Nigeria aside as rejected / 'not_eligible',
 * so admins never see them as pending.
 *
 * Weights (simple on purpose; they add up to 100):
 *   Location ............ 0–40   Lagos 40 · elsewhere in Nigeria 35 ·
 *                                Africa/EMEA 30 · remote worldwide 30 ·
 *                                not stated 20 · somewhere else 10 ·
 *                                limited to another region 0 (not eligible)
 *   Career path matched ...  20
 *   Member demand ........ 0–15   15 × (members following this path ÷
 *                                members following the busiest path)
 *   Closing date ahead ....   5
 *   Title present .........   5
 *   Company present .......   5
 *   Description present ...  10
 *
 * "Limited to another region" means the location (or a location-only part of
 * the title, e.g. "Account Executive - Canada") names only the USA, a US state
 * or city, Canada, the UK, Europe/EU countries, Latin America or Asia-Pacific.
 * Any mention of Nigeria, Africa or EMEA keeps a job eligible. Unknown places
 * (e.g. "Cairo Governorate", "Dubai") stay eligible with a low score: when in
 * doubt, a person decides.
 *
 * The rest of this file is the thin database side: the per-source pending cap,
 * the 14-day / passed-deadline auto-expiry, member demand per path, and the
 * "migration not applied yet" check. Pure parts have no "@/" imports, so
 * `node --test` can run them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lagosToday } from "./job-validate.ts";

/** The job finder stops adding a source's jobs once this many are waiting. */
export const PENDING_CAP_PER_SOURCE = 30;
/** Pending jobs older than this are expired by each job-finder run. */
export const PENDING_MAX_AGE_DAYS = 14;

export const WEIGHTS = {
  location: { lagos: 40, nigeria: 35, africa: 30, worldwide: 30, unknown: 20, other: 10, restricted: 0 },
  careerPath: 20,
  demand: 15,
  deadline: 5,
  title: 5,
  company: 5,
  description: 10,
} as const;

export type LocationKind = keyof typeof WEIGHTS.location;

export interface ScorableJob {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  work_mode?: string | null;
  deadline?: string | null;
  description?: string | null;
  career_path_id?: string | null;
}

export interface ScoreContext {
  /** Members following each career path, keyed by career_paths.id. */
  membersPerPath?: Record<string, number>;
  /** Today's date in Lagos, YYYY-MM-DD (defaults to now). */
  today?: string;
}

export interface JobScore {
  score: number;
  eligible: boolean;
  /** Short plain-English reasons, strongest first (shown to admins). */
  reasons: string[];
}

// ── Place names ────────────────────────────────────────────────────────────

const LAGOS_RE =
  /\b(lagos|ikeja|lekki|ikoyi|victoria island|yaba|surulere|apapa|ajah|ikorodu|festac|oshodi|agege|gbagada|magodo|ojota|ilupeju|isolo|badagry|somolu|shomolu|ojodu)\b/i;

const NIGERIA_RE = new RegExp(
  "\\b(" +
    [
      "nigeria", "nigerian", "abuja", "fct", "port harcourt", "ibadan", "kano", "kaduna", "enugu", "benin city", "warri",
      "calabar", "uyo", "owerri", "onitsha", "asaba", "abeokuta", "ilorin", "akure", "osogbo", "ile[- ]?ife", "jos",
      "maiduguri", "zaria", "lokoja", "makurdi", "yola", "sokoto", "katsina", "bauchi", "gombe", "dutse", "jigawa",
      "kebbi", "zamfara", "minna", "lafia", "jalingo", "damaturu", "awka", "umuahia", "abakaliki", "yenagoa",
      "ado[- ]ekiti", "ekiti", "ondo", "osun", "oyo", "ogun", "kwara", "kogi", "benue", "nasarawa", "plateau state",
      "taraba", "adamawa", "borno", "yobe", "anambra", "imo state", "abia", "ebonyi", "akwa ibom", "cross river",
      "bayelsa", "rivers state", "delta state", "edo state", "niger state", "sagamu", "akute",
    ].join("|") +
    ")\\b",
  "i",
);

const AFRICA_RE = /\b(africa|african|emea|mea|sub[- ]saharan)\b|europe,?\s+(the\s+)?middle east,?\s+(and|&)\s+africa/i;

const WORLDWIDE_RE = /\b(anywhere|worldwide|world[- ]wide|global|globally|international|remote|distributed|any location|all countries)\b/i;

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
  "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];

/** Places that, on their own, limit a job to applicants outside Nigeria. Lower case. */
const RESTRICTED_PLACES = [
  // USA
  "usa", "united states", "united states of america", "america", "americas", "north america",
  "nyc", "san francisco", "bay area", "los angeles", "seattle", "boston", "chicago", "austin", "denver", "sacramento",
  "washington dc", "washington d.c.", ...US_STATES,
  // Canada
  "canada", "canadian", "toronto", "vancouver", "montreal", "ontario", "quebec", "british columbia", "alberta",
  "calgary", "ottawa",
  // UK
  "united kingdom", "england", "scotland", "wales", "northern ireland", "great britain", "britain", "london",
  "manchester", "edinburgh",
  // Europe
  "europe", "european union", "eea", "schengen", "germany", "france", "spain", "portugal", "netherlands", "poland",
  "italy", "ireland", "sweden", "norway", "denmark", "finland", "belgium", "austria", "switzerland", "czechia",
  "czech republic", "romania", "greece", "hungary", "ukraine", "estonia", "latvia", "lithuania", "croatia", "serbia",
  "bulgaria", "slovakia", "slovenia", "luxembourg", "berlin", "paris", "amsterdam", "madrid", "barcelona", "lisbon",
  "dublin", "warsaw", "munich", "stockholm", "copenhagen", "zurich", "vienna", "prague",
  // Latin America
  "latin america", "latam", "south america", "central america", "mexico", "brazil", "argentina", "colombia", "chile",
  "peru", "uruguay", "costa rica",
  // Asia-Pacific
  "apac", "asia", "asia-pacific", "asia pacific", "india", "philippines", "pakistan", "singapore", "australia",
  "new zealand", "anz", "japan", "china", "indonesia", "vietnam", "malaysia", "thailand", "bangladesh", "sri lanka",
  "hong kong", "korea", "south korea",
];
const RESTRICTED_SET = new Set(RESTRICTED_PLACES);
/** Upper-case codes, matched case-sensitively so "us"/"in" in ordinary words don't count. */
const RESTRICTED_CODES = ["US", "USA", "U.S.", "U.S.A.", "U.S", "UK", "U.K.", "GB", "EU"];
const RESTRICTED_CODE_RE = /(?:^|[^A-Za-z.])(US|USA|U\.S\.A?\.?|UK|U\.K\.|GB|EU)(?![A-Za-z])/;
const US_STATE_CODE_RE =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const RESTRICTED_WORDS_RE = new RegExp(
  `\\b(${RESTRICTED_PLACES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})\\b`,
  "i",
);

/** Timezone/working-hours phrases ("US time zones", "overlap with EST hours") don't limit where you live. */
function stripTimezones(text: string): string {
  return text
    .replace(/\b[\w.]+(?:\s+[\w.]+)?\s+(?:time\s*zones?|timezones?|business\s+hours|working\s+hours|hours)\b/gi, " ")
    .replace(/\b(?:UTC|GMT)\s*[-+−±]?\s*\d*(?:\s*(?:to|-|–)\s*[-+−]?\d+)?/gi, " ")
    .replace(/\b(?:EST|PST|CST|MST|CET|WAT|EET)\b/g, " ");
}

function mentionsRestricted(text: string): boolean {
  const t = stripTimezones(text);
  return RESTRICTED_WORDS_RE.test(t) || RESTRICTED_CODE_RE.test(t) || US_STATE_CODE_RE.test(t);
}

const NEUTRAL_WORDS_RE = /\b(remote|only|based|hybrid|on-?site|in|the|anywhere|from|within|residents?|candidates?|must|be|work)\b/gi;

/** One location-like part of a title → its kind, or null when it isn't purely a place. */
function placeKind(part: string): "nigeria" | "africa" | "worldwide" | "restricted" | null {
  const raw = part.trim();
  if (!raw) return null;
  if (LAGOS_RE.test(raw) || NIGERIA_RE.test(raw)) {
    // Only when the whole part is a place (e.g. "Abuja", "Lagos State").
    const rest = raw.replace(LAGOS_RE, "").replace(NIGERIA_RE, "").replace(/\b(state|fct|nigeria)\b/gi, "").replace(NEUTRAL_WORDS_RE, "").replace(/[\s().,-]+/g, "");
    return rest ? null : "nigeria";
  }
  if (/^(worldwide|world[- ]wide|global|globally|international)$/i.test(raw.replace(NEUTRAL_WORDS_RE, "").trim())) return "worldwide";
  const stripped = raw.replace(NEUTRAL_WORDS_RE, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  if (/^(africa|african|emea|mea|sub[- ]saharan africa|west africa)$/i.test(stripped)) return "africa";
  if (RESTRICTED_SET.has(stripped.toLowerCase()) || RESTRICTED_CODES.includes(stripped)) return "restricted";
  return null;
}

/**
 * Location-only parts of a title: "(Canada)", "- Canada, Spain, India",
 * "(USA only)". Returns "restricted" only when EVERY part is a restricted
 * place, "nigeria"/"africa"/"worldwide" when a part says so, else null.
 * "(US b2c subscription only)" is not a place, so it is ignored.
 */
export function titleLocationHint(title: string | null | undefined): "nigeria" | "africa" | "worldwide" | "restricted" | null {
  if (!title) return null;
  const segments: string[] = [];
  for (const m of title.matchAll(/\(([^()]{1,80})\)/g)) segments.push(m[1]);
  const dash = /\s[-–—|]\s([^-–—|()]{1,80})$/.exec(title.replace(/\s*\([^()]*\)\s*$/, ""));
  if (dash) segments.push(dash[1]);
  let result: "nigeria" | "africa" | "worldwide" | "restricted" | null = null;
  for (const segment of segments) {
    const parts = segment.split(/,|\/|&|;|\band\b|\bor\b/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const kinds = parts.map(placeKind);
    if (kinds.some((k) => k === null)) continue; // not purely a list of places
    if (kinds.includes("nigeria")) return "nigeria";
    if (kinds.includes("africa")) result = "africa";
    else if (kinds.includes("worldwide")) result ??= "worldwide";
    else if (kinds.every((k) => k === "restricted")) result ??= "restricted";
  }
  return result;
}

/** "The position is located in Yaba, Lagos State." (Nigerian job boards) → "Yaba, Lagos State". */
export function locationFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = /\b(?:position|role|job|vacancy) is (?:located|based) in:?\s*([^.;]{2,120})/i.exec(description);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

export interface LocationVerdict {
  kind: LocationKind;
  reason: string;
}

/** Where the job is and whether people living in Nigeria can apply. Pure. */
export function classifyLocation(job: ScorableJob): LocationVerdict {
  const location = (job.location ?? "").replace(/\s+/g, " ").trim();
  const title = job.title ?? "";
  const described = location ? null : locationFromDescription(job.description);
  const place = location || described || "";
  const titleHint = titleLocationHint(title);
  const remote = job.work_mode === "remote";

  // 1. Any mention of Lagos/Nigeria (location, a place in the title, the
  //    "located in" sentence, or — with no location — the company/description).
  const fallbackText = location ? "" : `${job.company ?? ""} ${described ? "" : (job.description ?? "")}`;
  const strongNigeria = /\b(nigeria|nigerian|lagos|abuja)\b/i;
  if (LAGOS_RE.test(place) || (titleHint === "nigeria" && LAGOS_RE.test(title)) || (!place && /\blagos\b/i.test(fallbackText))) {
    return { kind: "lagos", reason: "In Lagos" };
  }
  if (NIGERIA_RE.test(place) || titleHint === "nigeria" || (!place && strongNigeria.test(fallbackText))) {
    return { kind: "nigeria", reason: "In Nigeria" };
  }

  // 2. A title that names only other regions overrides a generic "Anywhere".
  if (titleHint === "restricted" && !AFRICA_RE.test(place)) {
    return { kind: "restricted", reason: "Title limits it to another region (not open to Nigeria)" };
  }

  // 3. The location itself.
  if (AFRICA_RE.test(place) || titleHint === "africa") return { kind: "africa", reason: "Open to Africa / EMEA" };
  if (place && mentionsRestricted(place)) {
    return { kind: "restricted", reason: `Limited to ${place.slice(0, 60)} (not open to Nigeria)` };
  }
  if ((place && WORLDWIDE_RE.test(place)) || titleHint === "worldwide") {
    return { kind: "worldwide", reason: "Remote, open worldwide" };
  }
  if (!place) return { kind: "unknown", reason: remote ? "Remote; location not stated" : "Location not stated" };
  return { kind: "other", reason: `Based in ${place.slice(0, 60)}` };
}

function present(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Member-demand points: 15 × this path's followers ÷ the busiest path's followers. */
export function demandPoints(pathId: string | null | undefined, membersPerPath: Record<string, number> | undefined): number {
  if (!pathId || !membersPerPath) return 0;
  const counts = Object.values(membersPerPath).filter((n) => Number.isFinite(n) && n > 0);
  const max = counts.length ? Math.max(...counts) : 0;
  const n = membersPerPath[pathId] ?? 0;
  if (max <= 0 || !(n > 0)) return 0;
  return Math.round((WEIGHTS.demand * Math.min(n, max)) / max);
}

/** Scores one job 0–100 and decides eligibility. Pure (see the weights above). */
export function scoreJob(job: ScorableJob, ctx: ScoreContext = {}): JobScore {
  const today = ctx.today ?? lagosToday();
  const loc = classifyLocation(job);
  const reasons: string[] = [loc.reason];
  let score: number = WEIGHTS.location[loc.kind];

  if (job.career_path_id) {
    score += WEIGHTS.careerPath;
    const demand = demandPoints(job.career_path_id, ctx.membersPerPath);
    const followers = ctx.membersPerPath?.[job.career_path_id] ?? 0;
    reasons.push(
      followers > 0
        ? `Matches a career path ${followers} member${followers === 1 ? "" : "s"} follow${followers === 1 ? "s" : ""}`
        : "Matches a career path",
    );
    score += demand;
  } else {
    reasons.push("No career path matched");
  }

  const deadline = typeof job.deadline === "string" ? job.deadline.slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline >= today) {
    score += WEIGHTS.deadline;
    reasons.push("Closing date ahead");
  }
  if (present(job.title)) score += WEIGHTS.title;
  else reasons.push("No title");
  if (present(job.company)) score += WEIGHTS.company;
  else reasons.push("No company");
  if (present(job.description)) score += WEIGHTS.description;
  else reasons.push("No description");

  return { score: Math.max(0, Math.min(100, Math.round(score))), eligible: loc.kind !== "restricted", reasons };
}

// ── Backfill planning (pure) ───────────────────────────────────────────────

export interface PendingJobRow extends ScorableJob {
  id: string;
  source_id?: string | null;
  created_at?: string | null;
}

export interface BackfillPlan {
  /** relevance → job ids (eligible jobs keep 'pending'). */
  scores: Map<number, string[]>;
  /** Jobs to set aside as rejected / not_eligible. */
  notEligible: { id: string; score: number; reason: string; row: PendingJobRow }[];
  /** Every job's score, for the summary. */
  all: { row: PendingJobRow; result: JobScore; kind: LocationKind }[];
}

export function planBackfill(rows: PendingJobRow[], ctx: ScoreContext): BackfillPlan {
  const scores = new Map<number, string[]>();
  const notEligible: BackfillPlan["notEligible"] = [];
  const all: BackfillPlan["all"] = [];
  for (const row of rows) {
    const result = scoreJob(row, ctx);
    all.push({ row, result, kind: classifyLocation(row).kind });
    if (!result.eligible) {
      notEligible.push({ id: row.id, score: result.score, reason: result.reasons[0], row });
      continue;
    }
    const ids = scores.get(result.score) ?? [];
    ids.push(row.id);
    scores.set(result.score, ids);
  }
  return { scores, notEligible, all };
}

// ── Database helpers (thin) ────────────────────────────────────────────────

/**
 * True when Postgres/PostgREST says a column doesn't exist: the Stage 1
 * migration (relevance, reject_reason, reviewed_at) isn't applied yet.
 * 42703 = undefined column (selects/filters); PGRST204 = unknown column in
 * an insert/update body.
 */
export function isMissingColumn(error: { code?: string | null } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204");
}

/** The Stage 1 review fields, removed when the migration isn't applied yet. */
export const REVIEW_FIELDS = ["relevance", "reject_reason", "reviewed_at"] as const;

export function withoutReviewFields<T extends Record<string, unknown>>(row: T): Omit<T, (typeof REVIEW_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const f of REVIEW_FIELDS) delete copy[f];
  return copy as Omit<T, (typeof REVIEW_FIELDS)[number]>;
}

/** Members following each career path (counts only; no member data). Empty on error. */
export async function loadMembersPerPath(admin: SupabaseClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const { data, error } = await admin.from("member_career_paths").select("career_path_id").limit(50_000);
    if (error || !Array.isArray(data)) {
      if (error) console.error(`[job-relevance] could not count members per path (${error.code ?? "unknown"})`);
      return counts;
    }
    for (const r of data as { career_path_id: string | null }[]) {
      if (r.career_path_id) counts[r.career_path_id] = (counts[r.career_path_id] ?? 0) + 1;
    }
  } catch {
    // demand is a bonus signal: carry on without it
  }
  return counts;
}

/** How many of a source's jobs are waiting for review; null when it can't be counted. */
export async function countPendingForSource(admin: SupabaseClient, sourceId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId)
    .eq("review_status", "pending");
  if (error) {
    console.error(`[job-relevance] could not count pending jobs (${error.code ?? "unknown"})`);
    return null;
  }
  return typeof count === "number" ? count : 0;
}

export interface ExpiryResult {
  ok: boolean;
  /** Pending jobs moved to rejected / 'expired' this run. */
  expired: number;
  /** True when the migration isn't applied (expired without reason/date). */
  columnsMissing: boolean;
}

/**
 * Auto-expiry, run by each job-finder run: pending jobs older than 14 days or
 * whose closing date (Lagos) has passed → rejected, reject_reason 'expired',
 * reviewed_at now. Only 'pending' rows are touched: live jobs are the link
 * checker's business. Never throws.
 */
export async function expireStalePendingJobs(admin: SupabaseClient, nowMs: number = Date.now()): Promise<ExpiryResult> {
  const cutoff = new Date(nowMs - PENDING_MAX_AGE_DAYS * 86_400_000).toISOString();
  const today = lagosToday(nowMs);
  const full = { review_status: "rejected", is_active: false, reject_reason: "expired", reviewed_at: new Date(nowMs).toISOString() };
  let columnsMissing = false;
  let expired = 0;
  let ok = true;

  const run = async (column: "created_at" | "deadline", value: string) => {
    const attempt = (payload: Record<string, unknown>) =>
      admin.from("jobs").update(payload).eq("review_status", "pending").lt(column, value).select("id");
    let res = await attempt(columnsMissing ? withoutReviewFields(full) : full);
    if (res.error && isMissingColumn(res.error) && !columnsMissing) {
      columnsMissing = true;
      res = await attempt(withoutReviewFields(full));
    }
    if (res.error) {
      ok = false;
      console.error(`[job-relevance] auto-expiry failed (${res.error.code ?? "unknown"})`);
      return;
    }
    expired += Array.isArray(res.data) ? res.data.length : 0;
  };

  try {
    await run("created_at", cutoff);
    await run("deadline", today);
  } catch {
    ok = false;
  }
  return { ok, expired, columnsMissing };
}
