/**
 * Shared steps for the two posting routes (threads and replies): rate limit,
 * moderation → columns, moderation_log, and the message shown to the author.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModerationResult } from "@/lib/agents/moderation";
import type { PostStatus } from "@/types";

export const POST_LIMIT = 10;
export const POST_WINDOW_MS = 10 * 60 * 1000;

export const POST_MESSAGES = {
  posted: "Posted.",
  held: "Held for review — a community manager will check it soon.",
  rateLimited: "You've posted a lot in the last few minutes. Please wait a little and try again.",
  saveFailed: "We couldn't save your post just now. Please try again.",
} as const;

/** True when the author already has ≥ 10 posts (threads + replies, any status) in the last 10 minutes. Null on error. */
export async function isRateLimited(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  const since = new Date(Date.now() - POST_WINDOW_MS).toISOString();
  const [threads, replies] = await Promise.all([
    admin.from("threads").select("id", { count: "exact", head: true }).eq("author_id", userId).gte("created_at", since),
    admin.from("replies").select("id", { count: "exact", head: true }).eq("author_id", userId).gte("created_at", since),
  ]);
  if (threads.error || replies.error) {
    console.error(`[api/community] rate-limit count failed (${threads.error?.code ?? replies.error?.code ?? "unknown"})`);
    return null;
  }
  return (threads.count ?? 0) + (replies.count ?? 0) >= POST_LIMIT;
}

/** Security-relevant columns come from moderation, never from the request body. */
export function moderationColumns(result: ModerationResult): {
  status: Extract<PostStatus, "visible" | "held">;
  needs_review: boolean;
  moderation_reason: string | null;
  moderation_categories: string[];
  moderated_by: "agent" | null;
} {
  if (result.source === "unavailable") {
    // Fail open, with review: publish and let the sweep or a human re-check it.
    return { status: "visible", needs_review: true, moderation_reason: null, moderation_categories: [], moderated_by: null };
  }
  if (result.decision === "hold") {
    return {
      status: "held",
      needs_review: false,
      moderation_reason: result.reason.slice(0, 500) || null,
      moderation_categories: result.categories,
      moderated_by: "agent",
    };
  }
  return { status: "visible", needs_review: false, moderation_reason: null, moderation_categories: [], moderated_by: "agent" };
}

/** moderation_log row for the automatic decision: allow / hold by the agent, or flag when it was unavailable. */
export async function logPostModeration(
  admin: SupabaseClient,
  entry: { communityId: string; targetType: "thread" | "reply"; targetId: string; result: ModerationResult },
): Promise<void> {
  const { result } = entry;
  const unavailable = result.source === "unavailable";
  const { error } = await admin.from("moderation_log").insert({
    community_id: entry.communityId,
    target_type: entry.targetType,
    target_id: entry.targetId,
    actor_type: unavailable ? "system" : "agent",
    actor_id: null,
    action: unavailable ? "flag" : result.decision,
    reason: (unavailable ? `Published without an automatic check: ${result.reason}` : result.reason).slice(0, 500) || null,
  });
  if (error) console.error(`[api/community] moderation_log insert failed (${error.code ?? "unknown"})`);
}

export function postMessage(status: "visible" | "held"): string {
  return status === "held" ? POST_MESSAGES.held : POST_MESSAGES.posted;
}
