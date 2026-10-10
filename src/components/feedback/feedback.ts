/**
 * Member feedback: shared labels, limits and the same-site path check
 * (docs/phase-3-contracts.md, Phase 3.2 addendum). Wording is fixed by the
 * contract — change it there first.
 *
 * Type-only imports and no React, so the API route, pages and components can all use it.
 */
import type { FeedbackKind, FeedbackStatus, FeedbackTargetType } from "@/types";

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["link", "wrong_info", "broken", "idea"];
export const FEEDBACK_TARGET_TYPES: readonly FeedbackTargetType[] = ["job", "announcement", "career_path", "community"];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  link: "This link doesn't work",
  wrong_info: "Something here is wrong",
  broken: "Something's broken",
  idea: "I have an idea",
};

/** What the sender sees. (The admin list says "New" instead of "Received".) */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Received",
  looking: "Looking into it",
  fixed: "Fixed",
  not_now: "Not now",
};

export const FEEDBACK_LIMITS = {
  message: 400,
  ideaMin: 3,
  pagePath: 300,
} as const;

export const FEEDBACK_COPY = {
  hint: "Wrong details, a link that doesn't work, or an idea to make this better. To report a person or a post, use Report instead.",
  thanks:
    "Thank you, that really helps. Someone from the YPC team will read it within 3 days. You can see its progress on your dashboard.",
  rateLimited: "You've sent a few already. Please wait a few minutes and try again.",
  footerLink: "Spotted a problem or have an idea? Tell us.",
  jobLink: "Link not working?",
  eventLink: "Wrong details?",
} as const;

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === "string" && (FEEDBACK_KINDS as readonly string[]).includes(v);
}

export function isFeedbackTargetType(v: unknown): v is FeedbackTargetType {
  return typeof v === "string" && (FEEDBACK_TARGET_TYPES as readonly string[]).includes(v);
}

/**
 * A same-site path (pathname + search, no hash) of at most 300 characters, or
 * null. Rejects full URLs, protocol-relative "//host" links, backslashes and
 * control characters (URL parsers rewrite "/\t/evil" into "//evil").
 */
export function sameSitePath(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\\s]/.test(v)) return null;
  try {
    const u = new URL(v, "https://x.invalid");
    if (u.origin !== "https://x.invalid") return null;
    const path = u.pathname + u.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.length > FEEDBACK_LIMITS.pagePath) return null;
    return path;
  } catch {
    return null;
  }
}
