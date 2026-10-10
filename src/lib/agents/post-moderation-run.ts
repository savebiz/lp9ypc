/**
 * Background post moderation for Phase 3 "instant posting"
 * (docs/phase-3-contracts.md). The route saves the post as 'pending',
 * answers the author straight away, and schedules runPostModeration() with
 * Next's after() (see post-moderation-job.ts, which re-exports everything here).
 *
 * Result mapping (unchanged from Phase 2):
 *   - allow                      → visible
 *   - hold (model, local rule or Google safety block) → held + reason/categories, moderated_by 'agent'
 *   - AI unavailable (no key, quota, busy, timeout)   → visible + needs_review = true (fail open, with review)
 *
 * The row is only updated while it is still 'pending', so a manager's action
 * (or the author deleting the post) in the meantime always wins.
 *
 * No "next/*" or "@/" imports, so `node --test` can load it with a fake client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKGROUND_MODERATION_TIMEOUT_MS, moderatePost, type ModerationResult } from "./moderation.ts";

export interface PostModerationJob {
  kind: "thread" | "reply";
  id: string;
  communityId: string;
  communityName: string;
  /** Threads only. */
  title?: string;
  body: string;
}

export interface PostModerationColumns {
  status: "visible" | "held";
  needs_review: boolean;
  moderation_reason: string | null;
  moderation_categories: string[];
  moderated_by: "agent" | null;
}

/** Security-relevant columns come from moderation, never from the request body. Pure. */
export function moderationColumns(result: ModerationResult): PostModerationColumns {
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

/**
 * moderation_log row for an automatic decision: allow / hold by the agent, or
 * flag when it was unavailable. Same rows Phase 2's logPostModeration wrote.
 * Routes use this too when a local rule holds a post synchronously.
 */
export async function logPostModeration(
  admin: SupabaseClient,
  entry: { communityId: string; targetType: "thread" | "reply"; targetId: string; result: ModerationResult },
): Promise<void> {
  const { result } = entry;
  const unavailable = result.source === "unavailable";
  try {
    const { error } = await admin.from("moderation_log").insert({
      community_id: entry.communityId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      actor_type: unavailable ? "system" : "agent",
      actor_id: null,
      action: unavailable ? "flag" : result.decision,
      reason: (unavailable ? `Published without an automatic check: ${result.reason}` : result.reason).slice(0, 500) || null,
    });
    if (error) console.error(`[post-moderation] moderation_log insert failed (${error.code ?? "unknown"})`);
  } catch {
    console.error("[post-moderation] moderation_log insert failed (exception)");
  }
}

/**
 * Runs the Gemini check, applies the result to the row (only if still
 * 'pending'), logs it. Never throws.
 * Returns the final status: "visible" / "held" when applied, or "pending" when
 * nothing was applied (the row changed meanwhile, or the update failed — the
 * daily sweep and the thread page's stale safety net pick those up).
 */
export async function runPostModeration(
  admin: SupabaseClient,
  job: PostModerationJob,
  opts: { timeoutMs?: number } = {},
): Promise<"visible" | "held" | "pending"> {
  try {
    const result = await moderatePost(
      { kind: job.kind, title: job.kind === "thread" ? job.title : undefined, body: job.body, communityName: job.communityName },
      { timeoutMs: opts.timeoutMs ?? BACKGROUND_MODERATION_TIMEOUT_MS },
    );
    const columns = moderationColumns(result);
    const table = job.kind === "thread" ? "threads" : "replies";

    const { data, error } = await admin
      .from(table)
      .update(columns)
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id");
    if (error) {
      console.error(`[post-moderation] update failed (${error.code ?? "unknown"})`);
      return "pending";
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "pending"; // a manager or the author acted first

    await logPostModeration(admin, { communityId: job.communityId, targetType: job.kind, targetId: job.id, result });
    return columns.status;
  } catch {
    console.error("[post-moderation] run failed (exception)");
    return "pending";
  }
}
