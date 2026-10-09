/**
 * Schema for job extraction + code-side re-validation of whatever the model
 * returns (lp9-ai-agents: "never trust the model's JSON blindly").
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */
import { buildLinkIndex, matchPageLink } from "./link-validate.ts";
import { jobDedupeKey } from "./dedupe.ts";

export const MAX_JOBS_PER_PAGE = 25;

export const WORK_MODES = ["remote", "onsite", "hybrid"] as const;
export const ENGAGEMENT_TYPES = ["full-time", "part-time", "contract", "internship", "graduate-trainee"] as const;
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior"] as const;
/** Sentinel the model uses instead of null in enum fields (keeps the schema simple). */
export const UNKNOWN = "unknown";

export interface ValidJob {
  title: string;
  company: string;
  location: string | null;
  work_mode: (typeof WORK_MODES)[number] | null;
  engagement_type: (typeof ENGAGEMENT_TYPES)[number] | null;
  experience_level: (typeof EXPERIENCE_LEVELS)[number] | null;
  deadline: string | null;
  description: string | null;
  /** Always the page's own copy of a link that is really on the page. */
  application_link: string;
  salary_range: string | null;
  career_path_slug: string | null;
  dedupe_key: string;
}

export interface JobValidationContext {
  pageUrl: string;
  pageLinks: string[];
  /** Career-path slugs from the catalogue. */
  slugs: string[];
  /** Today's date in Lagos, YYYY-MM-DD. */
  today: string;
}

export interface JobValidationResult {
  jobs: ValidJob[];
  dropped: { missing_fields: number; link_not_on_page: number; past_deadline: number; duplicate: number };
}

/** Today's date in Lagos (UTC+1 all year, no daylight saving), YYYY-MM-DD. */
export function lagosToday(now: number = Date.now()): string {
  return new Date(now + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildJobSchema(slugs: string[]): Record<string, unknown> {
  const nullableString = (description: string) => ({ type: ["string", "null"], description });
  const enumOrUnknown = (values: readonly string[]) => ({ type: "string", enum: [...values, UNKNOWN] });
  return {
    type: "object",
    properties: {
      jobs: {
        type: "array",
        // No maxItems: Gemini rejects it on this array of objects (HTTP 400).
        // validateExtractedJobs caps the list at MAX_JOBS_PER_PAGE instead.
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Job title exactly as on the page." },
            company: { type: "string", description: "Hiring organisation as on the page." },
            location: nullableString("City/state/country as on the page, or null."),
            work_mode: enumOrUnknown(WORK_MODES),
            engagement_type: enumOrUnknown(ENGAGEMENT_TYPES),
            experience_level: enumOrUnknown(EXPERIENCE_LEVELS),
            deadline: nullableString("Closing date as YYYY-MM-DD only if the page states one, else null."),
            description: nullableString("One or two plain sentences (max 600 characters) based only on the page, or null."),
            application_link: { type: "string", description: "A URL copied exactly from the page text." },
            salary_range: nullableString("Salary as stated on the page (max 80 characters), or null."),
            career_path_slug: { type: "string", enum: [...slugs, "none"] },
          },
          required: [
            "title", "company", "location", "work_mode", "engagement_type", "experience_level",
            "deadline", "description", "application_link", "salary_range", "career_path_slug",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["jobs"],
    additionalProperties: false,
  };
}

/** Collapses whitespace, strips control characters; null when empty. Caps at `max` characters. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : s;
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** A real calendar date "YYYY-MM-DD", else null. */
export function validDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
}

/** Re-validates extracted jobs: enums, lengths, Apply link on the page, deadlines, duplicates. */
export function validateExtractedJobs(raw: unknown, ctx: JobValidationContext): JobValidationResult {
  const dropped = { missing_fields: 0, link_not_on_page: 0, past_deadline: 0, duplicate: 0 };
  const items =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { jobs?: unknown }).jobs)
      ? ((raw as { jobs: unknown[] }).jobs)
      : [];

  const linkIndex = buildLinkIndex(ctx.pageLinks, ctx.pageUrl);
  const slugs = new Set(ctx.slugs);
  const latestDeadline = `${Number(ctx.today.slice(0, 4)) + 2}${ctx.today.slice(4)}`;
  const seen = new Set<string>();
  const jobs: ValidJob[] = [];

  for (const item of items.slice(0, MAX_JOBS_PER_PAGE)) {
    if (typeof item !== "object" || item === null) {
      dropped.missing_fields++;
      continue;
    }
    const j = item as Record<string, unknown>;
    const title = cleanText(j.title, 160);
    const company = cleanText(j.company, 160);
    if (!title || !company) {
      dropped.missing_fields++;
      continue;
    }

    const link = matchPageLink(j.application_link, linkIndex, ctx.pageUrl);
    if (!link) {
      dropped.link_not_on_page++;
      continue;
    }

    let deadline = validDate(j.deadline);
    if (deadline && deadline < ctx.today) {
      dropped.past_deadline++;
      continue;
    }
    if (deadline && deadline > latestDeadline) deadline = null; // implausible — don't show it

    const dedupe_key = jobDedupeKey(company, title, link);
    if (seen.has(dedupe_key)) {
      dropped.duplicate++;
      continue;
    }
    seen.add(dedupe_key);

    const slug = typeof j.career_path_slug === "string" && slugs.has(j.career_path_slug) ? j.career_path_slug : null;
    jobs.push({
      title,
      company,
      location: cleanText(j.location, 120),
      work_mode: pick(j.work_mode, WORK_MODES),
      engagement_type: pick(j.engagement_type, ENGAGEMENT_TYPES),
      experience_level: pick(j.experience_level, EXPERIENCE_LEVELS),
      deadline,
      description: cleanText(j.description, 600),
      application_link: link,
      salary_range: cleanText(j.salary_range, 80),
      career_path_slug: slug,
      dedupe_key,
    });
  }
  return { jobs, dropped };
}
