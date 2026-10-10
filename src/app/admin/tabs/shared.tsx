"use client";

import { CircleAlert } from "lucide-react";
import type {
  AdminAuditEntry, AgentRun, Announcement, CareerPath, CareerPathCandidate, Community, CommunityMember, CommunityOverview,
  Feedback, Job, JobSource, LinkHealth, Profile, Reply, Report, Thread,
} from "@/types";

/** Everything the admin page loads (admin-readable under RLS). Phase 2 lists may be empty. */
export interface AdminData {
  adminId: string;
  jobs: Job[];
  members: Profile[];
  careerPaths: CareerPath[];
  announcements: Announcement[];
  memberPaths: { member_id: string; career_path_id: string }[];
  // Phase 2
  jobSources: JobSource[];
  communities: Community[];
  communityMembers: Pick<CommunityMember, "community_id" | "member_id" | "role">[];
  communityOverview: CommunityOverview[];
  heldThreads: Thread[];
  heldReplies: Reply[];
  openReports: Report[];
  /** Threads/replies referenced by held replies and open reports (for context). */
  relatedThreads: Thread[];
  relatedReplies: Reply[];
  candidates: CareerPathCandidate[];
  agentRuns: AgentRun[];
  /** Newest 50 admin_audit rows (Phase 3.1). */
  audit: AdminAuditEntry[];
  /** Member feedback, newest first (Phase 3.2). null = the feedback table isn't set up yet: hide feedback parts. */
  feedback: Feedback[] | null;
  /** Apply-link check results (Phase 3.2). null = not set up yet. */
  linkHealth: LinkHealth[] | null;
}

/** Props every tab gets for feedback and refreshing server data. */
export interface TabActions {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onChanged: () => void;
}

export function Stat({ n, label }: { n: number; label: string }) {
  return <div className="stat"><div className="num">{n}</div><div className="lbl">{label}</div></div>;
}

/** Plain-English message for a Supabase/PostgREST error, for non-technical admins. */
export function friendlyDbError(action: string, error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (code === "23505") return `Couldn't ${action}: something with the same name or link already exists.`;
  if (code === "23514" || code === "22P02") return `Couldn't ${action}: one of the values isn't allowed. Check the form and try again.`;
  if (code === "42501" || msg.includes("permission") || msg.includes("row-level security")) {
    return `Couldn't ${action}: your account doesn't have permission. Make sure you're signed in as an admin.`;
  }
  if (code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache")) {
    return `Couldn't ${action}: this part isn't set up yet. Please tell the tech team.`;
  }
  if (msg.includes("fetch") || msg.includes("network")) return `Couldn't ${action}: we couldn't reach the server. Check your connection and try again.`;
  return `Couldn't ${action}. Please try again.${error?.message ? ` (Details: ${error.message})` : ""}`;
}

/**
 * Checks the result of an update/delete that asked for `.select("id")` back.
 * Row-level security silently skips rows it won't let you change, so "no
 * error but no rows" means nothing happened — say so instead of claiming success.
 */
export function writeProblem(
  action: string,
  res: { error: { code?: string; message?: string } | null; data: unknown[] | null },
): string | null {
  if (res.error) return friendlyDbError(action, res.error);
  if (!res.data || res.data.length === 0) {
    return `Couldn't ${action}: it may have been changed or removed by someone else. Refresh the page and try again.`;
  }
  return null;
}

/** The exact plain-English sentences the job finder stores in job_sources.last_error (docs/phase-3-contracts.md). */
const KNOWN_SOURCE_ERRORS = [
  "Blocked by the site's robots.txt, so we can't read it.",
  "No job listings found on this page.",
  "The AI service is busy right now. We'll try again on the next run.",
  "Gemini needs billing turned on for this key (quota exceeded).",
  "Couldn't open the page (it may be down or blocking us).",
];

/** A job source's last problem in plain English (older runs may have stored technical text). */
export function plainSourceError(status: string | null, error: string | null): { text: string; technical: string | null } | null {
  if (!error && status !== "blocked" && status !== "empty" && status !== "error") return null;
  const raw = (error ?? "").trim();
  if (KNOWN_SOURCE_ERRORS.includes(raw)) return { text: raw, technical: null };
  const low = raw.toLowerCase();
  let text: string;
  if (status === "blocked" || low.includes("robots")) text = KNOWN_SOURCE_ERRORS[0];
  else if (status === "empty") text = KNOWN_SOURCE_ERRORS[1];
  else if (low.includes("429") || low.includes("quota") || low.includes("billing")) text = KNOWN_SOURCE_ERRORS[3];
  else if (/\b(ai|gemini|extraction|model)\b|503|overload|timeout|timed out|unavailable|busy/.test(low)) text = KNOWN_SOURCE_ERRORS[2];
  else if (/couldn.t open|fetch|network|enotfound|econn|dns|certificate|status [45]\d\d/.test(low)) text = KNOWN_SOURCE_ERRORS[4];
  else text = "Something went wrong the last time we checked this page. Try Run now; if it keeps failing, tell the tech team.";
  return { text, technical: raw && raw !== text ? raw.slice(0, 300) : null };
}

/** Test accounts made during QA use this email domain. */
export const isTestAccount = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith("@example.test");

type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * POSTs JSON to one of our API routes (see docs/phase-2-contracts.md) and
 * turns every failure into a friendly sentence.
 */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<JsonResult<T>> {
  return sendJson<T>("POST", url, body);
}

/** PATCHes JSON to one of our API routes, with the same friendly errors as postJson. */
export async function patchJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<JsonResult<T>> {
  return sendJson<T>("PATCH", url, body);
}

async function sendJson<T>(method: "POST" | "PATCH", url: string, body: unknown): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (res.ok && json && json.ok === true) return { ok: true, data: json as T };
  const serverMessage = json && typeof json.error === "string" ? json.error : "";
  if (serverMessage) return { ok: false, error: serverMessage };
  return { ok: false, error: statusMessage(res.status) };
}

export async function getJson<T = Record<string, unknown>>(url: string): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
  }
  try {
    const json = (await res.json()) as Record<string, unknown>;
    if (res.ok && json.ok === true) return { ok: true, data: json as T };
    if (typeof json.error === "string") return { ok: false, error: json.error };
  } catch {
    /* fall through */
  }
  return { ok: false, error: statusMessage(res.status) };
}

function statusMessage(status: number): string {
  switch (status) {
    case 401: return "Your session has expired. Please sign in again.";
    case 403: return "You don't have permission to do that.";
    case 404: return "That isn't available yet. Please tell the tech team.";
    case 429: return "Too many requests. Please wait a few minutes and try again.";
    case 503: return "This feature isn't set up yet. Please tell the tech team.";
    default: return "Something went wrong on the server. Please try again.";
  }
}

/** "Lagos time" date + time, identical on server and browser. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  });
}

/** ISO timestamp → value for <input type="datetime-local"> (browser's local time). */
/** Lagos is UTC+1 all year (no daylight saving); event times are always entered and shown in Lagos time. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** ISO timestamp → <input type="datetime-local"> value in Lagos time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value, read as Lagos time → ISO timestamp, or null. */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Faith & Fellowship" → "faith-and-fellowship" (matches the database slug rule). */
export function slugify(text: string, max = 60): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function FieldError({ id, msg }: { id?: string; msg: string }) {
  return (
    <span className="field-error" id={id}>
      <CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {msg}
    </span>
  );
}

/** Builds a label → member name lookup from the loaded member list. */
export function memberNames(members: Profile[]): Map<string, string> {
  return new Map(members.map((m) => [m.id, m.full_name || m.email || "Member"]));
}
