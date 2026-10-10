// Shared helpers for the News & events portal (/news) and anywhere else that
// shows announcements or events (landing page, dashboard). Pure functions (no
// network of their own; `selectNews` only runs the query you give it), safe in
// server and client components.

import type { Announcement, AnnouncementScope } from "@/types";

/** Columns that exist before the flyer migration (20261011120000_replyto_audit_flyers.sql). */
export const NEWS_COLUMNS_BASE =
  "id, title, content, scope, scope_label, kind, starts_at, ends_at, location, link_url, created_at";

/**
 * The columns the news components need. Select these instead of "*".
 * Includes the flyer columns, which only exist once the flyer migration is
 * applied, so query through `selectNews()` rather than using this directly.
 */
export const NEWS_COLUMNS = `${NEWS_COLUMNS_BASE}, image_url, image_alt`;

/** What EventCard / AnnouncementItem need. A full `Announcement` row also fits. */
export type NewsItem = Pick<
  Announcement,
  | "id"
  | "title"
  | "content"
  | "scope"
  | "scope_label"
  | "kind"
  | "starts_at"
  | "ends_at"
  | "location"
  | "link_url"
  | "created_at"
  | "image_url"
  | "image_alt"
>;

type NewsQueryResult = { data: unknown; error: { code?: string; message?: string } | null };

/** Postgres "undefined column", e.g. before the flyer migration is applied. */
function isMissingFlyerColumn(error: NewsQueryResult["error"]): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const msg = error.message ?? "";
  return /image_(url|alt)/.test(msg) && /does not exist|schema cache/i.test(msg);
}

/**
 * Runs an announcements query with the flyer columns, and if the database
 * doesn't have them yet (Postgres 42703), runs it once more without them.
 * Same `{ data, error }` shape as a normal Supabase query. Usage:
 *
 *   selectNews((cols) => supabase.from("announcements").select(cols).eq("is_active", true)…)
 *
 * The builder is called again for the retry, so it must build a fresh query.
 */
export async function selectNews(
  build: (columns: string) => PromiseLike<NewsQueryResult>,
): Promise<{ data: NewsItem[] | null; error: NewsQueryResult["error"] }> {
  let res = await build(NEWS_COLUMNS);
  if (isMissingFlyerColumn(res.error)) res = await build(NEWS_COLUMNS_BASE);
  return { data: Array.isArray(res.data) ? (res.data as NewsItem[]) : null, error: res.error };
}

export interface Flyer {
  src: string;
  alt: string;
}

/** The flyer to show for an item, or null. Only https URLs are used. */
export function flyerOf(item: Pick<NewsItem, "title" | "image_url" | "image_alt">): Flyer | null {
  const raw = item.image_url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const alt = item.image_alt?.trim() || `${item.title} flyer`;
    return { src: u.toString(), alt };
  } catch {
    return null;
  }
}

export const SCOPES: readonly AnnouncementScope[] = ["parish", "province", "region", "national"];

/** Badge and filter-chip wording. */
export const SCOPE_NAMES: Record<AnnouncementScope, string> = {
  parish: "Parish",
  province: "Provincial",
  region: "Regional",
  national: "National",
};

/** Lower-case adjective for sentences: "No upcoming parish events right now." */
export const SCOPE_WORDS: Record<AnnouncementScope, string> = {
  parish: "parish",
  province: "provincial",
  region: "regional",
  national: "national",
};

/** Reads `?scope=` safely. Anything unknown (or missing) means "All" → null. */
export function parseScope(value: unknown): AnnouncementScope | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && (SCOPES as readonly string[]).includes(v) ? (v as AnnouncementScope) : null;
}

// ── Dates, always shown in Lagos time ─────────────────────────────────────
// Servers run in UTC, so never rely on the machine's own time zone.

export const NEWS_TIME_ZONE = "Africa/Lagos";

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: NEWS_TIME_ZONE, ...options });

const F_DAY = fmt({ day: "numeric" });
const F_MONTH = fmt({ month: "short" });
const F_YEAR = fmt({ year: "numeric" });
const F_WEEKDAY = fmt({ weekday: "long" });
const F_TIME = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const F_DATE_KEY = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
const F_SHORT_DATE = fmt({ day: "numeric", month: "short", year: "numeric" });
const F_SHORT_DATE_NO_YEAR = fmt({ weekday: "short", day: "numeric", month: "short" });
const F_LONG_DATE = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "9 Oct 2026" in Lagos time, or "" if the date is missing/invalid. */
export function formatNewsDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? F_SHORT_DATE.format(d) : "";
}

export interface EventWhen {
  /** ISO string for <time dateTime>. */
  iso: string;
  /** Big number on the date tile, e.g. "14". */
  day: string;
  /** Short month on the date tile, e.g. "Nov". */
  month: string;
  /** Only set when the event isn't in the current (Lagos) year. */
  year: string | null;
  /** Visible line, e.g. "Saturday · 10:00 am – 2:00 pm". */
  line: string;
  /** Full sentence for screen readers, e.g. "Saturday 14 November 2026, 10:00 am to 2:00 pm". */
  spoken: string;
}

/** Everything an event card needs to show when an event happens. Null if there's no valid start. */
export function eventWhen(startsAt: string | null | undefined, endsAt?: string | null): EventWhen | null {
  const start = toDate(startsAt);
  if (!start) return null;

  const end = toDate(endsAt);
  const validEnd = end && end.getTime() > start.getTime() ? end : null;
  const sameDay = validEnd ? F_DATE_KEY.format(validEnd) === F_DATE_KEY.format(start) : false;

  const startYear = F_YEAR.format(start);
  const thisYear = F_YEAR.format(new Date());
  const startTime = F_TIME.format(start);

  let line = `${F_WEEKDAY.format(start)} · ${startTime}`;
  let spoken = `${F_LONG_DATE.format(start)}, ${startTime}`;
  if (validEnd && sameDay) {
    const endTime = F_TIME.format(validEnd);
    line += ` – ${endTime}`;
    spoken += ` to ${endTime}`;
  } else if (validEnd) {
    const endTime = F_TIME.format(validEnd);
    line += ` – ${F_SHORT_DATE_NO_YEAR.format(validEnd)}, ${endTime}`;
    spoken += ` to ${F_LONG_DATE.format(validEnd)}, ${endTime}`;
  }

  return {
    iso: start.toISOString(),
    day: F_DAY.format(start),
    month: F_MONTH.format(start),
    year: startYear === thisYear ? null : startYear,
    line,
    spoken,
  };
}
