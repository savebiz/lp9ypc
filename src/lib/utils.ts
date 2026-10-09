import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY = 24 * 60 * 60 * 1000;

/** A deadline is open until the END of its day, not midnight UTC at its start. */
function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T23:59:59`);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No deadline";
  const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return endOfDay(dateStr).getTime() < Date.now();
}

/** Days left until a deadline closes (0 = closes today). Null if no deadline or already closed. */
export function daysLeft(dateStr: string | null): number | null {
  if (!dateStr || isExpired(dateStr)) return null;
  return Math.floor((endOfDay(dateStr).getTime() - Date.now()) / DAY);
}

export function isDeadlineSoon(dateStr: string | null): boolean {
  const d = daysLeft(dateStr);
  return d !== null && d <= 3;
}

export function closesLabel(dateStr: string | null): string {
  const d = daysLeft(dateStr);
  if (d === null) return dateStr ? "Closed" : "Open until filled";
  if (d === 0) return "Closes today";
  if (d === 1) return "Closes tomorrow";
  return `Closes ${formatShortDate(dateStr!)}`;
}

export function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Posted ${weeks} week${weeks > 1 ? "s" : ""} ago`;
  return `Posted ${formatShortDate(dateStr)}`;
}

export function isNew(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 3 * DAY;
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  // Control characters and backslashes are stripped or normalised by URL
  // parsers ("/\t/evil.example" becomes "//evil.example"), so reject them, then
  // resolve against a dummy origin and keep only same-origin paths.
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://x.invalid");
    if (u.origin !== "https://x.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** Returns the URL only if it is a real web link — never javascript:, data:, etc. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
}

/** Career path names are "Tech & Product" etc.; the short label is the first half. */
export function shortPathName(name: string): string {
  return name.split(" & ")[0];
}

/**
 * Builds a CSV cell safely: quotes are escaped, and values that a spreadsheet
 * would treat as a formula (=, +, -, @, tab, CR) are neutralised so an exported
 * member list can't run code when opened in Excel or Sheets.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  onsite: "On-site",
  hybrid: "Hybrid",
  any: "Open to any",
};

export const ENGAGEMENT_LABELS: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  "graduate-trainee": "Graduate trainee",
};

export const LEVEL_LABELS: Record<string, string> = {
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
};

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "employed", label: "Employed" },
  { value: "self-employed", label: "Self-employed" },
  { value: "unemployed", label: "Looking for work" },
  { value: "student", label: "Student" },
  { value: "other", label: "Other" },
];

export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "any", label: "Open to any" },
];
