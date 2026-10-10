/**
 * Background post moderation for Phase 3 "instant posting"
 * (docs/phase-3-contracts.md). The route saves the post as 'pending',
 * answers the author straight away, and schedules runPostModeration() with
 * Next's after() (see post-moderation-job.ts, which re-exports everything here).
 *
 * Result mapping:
 *   - allow                      → visible
 *   - hold (model, local rule or Google safety block) → held + reason/categories, moderated_by 'agent'
 *   - AI unavailable, brief outage (503, timeout, no key) on a NEW post
 *                                → visible + needs_review (fail open, with review: Phase 2 decision)
 *   - AI unavailable on an EDIT, or a quota/billing error on any post
 *                                → stays 'pending' + needs_review (FAIL CLOSED: hidden from others
 *                                  until the sweep or a human checks it)
 *
 * Stale-verdict guard (security review H1): every update matches the row's
 * id, status 'pending' AND the edited_at value the route saved (savedAt;
 * IS NULL for a brand-new post). If the author edits the post while a check
 * is running, the old verdict matches nothing and changes nothing; the edit's
 * own check decides. Never keyed on updated_at (likes bump it).
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
  /** The edited_at value the route wrote with this text (ISO string), or null for a brand-new post. */
  savedAt: string | null;
  /** True when this check is for an edit of an existing post (fails closed if the AI is unavailable). */
  isEdit?: boolean;
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
 * True when an unavailable check must NOT publish the post (security review
 * M1): edits (the earlier text was checked, the new one wasn't) and quota /
 * billing errors (not a brief outage, so "publish and re-check soon" would
 * really mean "publish unchecked for days"). Pure.
 */
export function mustFailClosed(result: ModerationResult, isEdit: boolean): boolean {
  return result.source === "unavailable" && (isEdit || result.unavailableKind === "quota");
}

/**
 * moderation_log row for an automatic decision: allow / hold by the agent, or
 * flag when it was unavailable (published with review, or `heldBack` = kept
 * hidden until checked). Routes use this too when a local rule holds a post.
 */
export async function logPostModeration(
  admin: SupabaseClient,
  entry: { communityId: string; targetType: "thread" | "reply"; targetId: string; result: ModerationResult; heldBack?: boolean },
): Promise<void> {
  const { result } = entry;
  const unavailable = result.source === "unavailable";
  const prefix = entry.heldBack ? "Hidden until it can be checked" : "Published without an automatic check";
  try {
    const { error } = await admin.from("moderation_log").insert({
      community_id: entry.communityId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      actor_type: unavailable ? "system" : "agent",
      actor_id: null,
      action: unavailable ? "flag" : result.decision,
      reason: (unavailable ? `${prefix}: ${result.reason}` : result.reason).slice(0, 500) || null,
    });
    if (error) console.error(`[post-moderation] moderation_log insert failed (${error.code ?? "unknown"})`);
  } catch {
    console.error("[post-moderation] moderation_log insert failed (exception)");
  }
}

/**
 * Runs the Gemini check, applies the result to the row (only if it is still
 * 'pending' with the same text), logs it. Never throws.
 * Returns the final status: "visible" / "held" when applied, or "pending"
 * when the post stays hidden (failed closed) or nothing was applied (the row
 * changed meanwhile, or the update failed; the sweep picks those up).
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
    const failClosed = mustFailClosed(result, job.isEdit === true);
    const update: Record<string, unknown> = failClosed
      ? { needs_review: true, moderated_by: null }
      : { ...moderationColumns(result) };
    const table = job.kind === "thread" ? "threads" : "replies";

    let query = admin.from(table).update(update).eq("id", job.id).eq("status", "pending");
    query = typeof job.savedAt === "string" ? query.eq("edited_at", job.savedAt) : query.is("edited_at", null);
    const { data, error } = await query.select("id");
    if (error) {
      console.error(`[post-moderation] update failed (${error.code ?? "unknown"})`);
      return "pending";
    }
    // A manager, the author (delete or a newer edit) acted first: this verdict is stale.
    if (!data || (Array.isArray(data) && data.length === 0)) return "pending";

    await logPostModeration(admin, { communityId: job.communityId, targetType: job.kind, targetId: job.id, result, heldBack: failClosed });
    return failClosed ? "pending" : (update.status as "visible" | "held");
  } catch {
    console.error("[post-moderation] run failed (exception)");
    return "pending";
  }
}
