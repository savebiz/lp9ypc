/**
 * Shared steps for the posting routes (threads, replies, post edits):
 * rate limit + create as 'pending', the synchronous local-rule hold, and the
 * thread page's stale safety net (docs/phase-3-contracts.md, instant posting).
 *
 * The AI check itself runs after the response, in
 * src/lib/agents/post-moderation-job.ts (owned by the ai-agents-engineer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkLocalRules } from "@/lib/agents/moderation-rules";
import {
  logPostModeration,
  moderationColumns,
  schedulePostModeration,
  type PostModerationJob,
} from "@/lib/agents/post-moderation-job";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST_LIMIT = 10;
export const POST_WINDOW_MS = 10 * 60 * 1000;
/** One edit per post per 2 minutes. */
export const EDIT_COOLDOWN_MS = 2 * 60 * 1000;
/** At most 5 edited posts (threads + replies) per author per 10 minutes. */
export const EDIT_AUTHOR_LIMIT = 5;
export const EDIT_AUTHOR_WINDOW_MS = 10 * 60 * 1000;

export const POST_MESSAGES = {
  pending: "Posted. We're doing a quick check before others can see it.",
  editPending: "Saved. We're doing a quick check before others can see it.",
  held: "Held for review — a community manager will check it soon.",
  rateLimited: "You've posted a lot in the last few minutes. Please wait a little and try again.",
  editTooSoon: "You've just edited this. Please wait a couple of minutes and try again.",
  editRateLimited: "You've edited a lot in the last few minutes. Please wait a little and try again.",
  editFirstCheck: "Your post is still being checked. You can edit it in a moment.",
  editHeldByManager: "This post has been held by a manager and can't be edited.",
  saveFailed: "We couldn't save your post just now. Please try again.",
} as const;

/**
 * Atomically checks the rate limit (10 posts per 10 minutes, threads + replies)
 * and creates the post as 'pending' in one database call, under a per-author
 * lock — so parallel requests can't all slip under the limit.
 * Returns the new post id, "limited", or null on error.
 */
export async function claimPostSlot(
  admin: SupabaseClient,
  slot: { authorId: string; communityId: string; threadId: string | null; title: string | null; body: string },
): Promise<string | "limited" | null> {
  const { data, error } = await admin.rpc("claim_post_slot", {
    p_author: slot.authorId,
    p_community: slot.communityId,
    p_thread: slot.threadId,
    p_title: slot.title,
    p_body: slot.body,
    p_limit: POST_LIMIT,
    p_window: `${POST_WINDOW_MS / 60000} minutes`,
  });
  if (error) {
    console.error(`[api/community] claim_post_slot failed (${error.code ?? "unknown"})`);
    return null;
  }
  return typeof data === "string" && data ? data : "limited";
}

/**
 * Runs the local rules (no network). On a hit, holds the still-pending post
 * straight away and logs it, so it never waits for the AI check.
 * Returns true when the post was held.
 */
export async function holdIfLocalRulesHit(admin: SupabaseClient, job: PostModerationJob): Promise<boolean> {
  const local = checkLocalRules([job.kind === "thread" ? job.title ?? "" : "", job.body].join("\n"));
  if (!local.hit) return false;
  const result = { decision: "hold" as const, categories: local.categories, reason: local.reason, source: "agent" as const };
  const table = job.kind === "thread" ? "threads" : "replies";
  // Only the exact version that was checked: a newer edit (different edited_at) is left pending for its own check.
  const base = admin.from(table).update(moderationColumns(result)).eq("id", job.id).eq("status", "pending");
  const { data, error } = await (job.savedAt ? base.eq("edited_at", job.savedAt) : base.is("edited_at", null)).select("id");
  if (error) {
    // Still pending (invisible to others): the stale safety net and the daily sweep pick it up.
    console.error(`[api/community] local-rule hold failed (${error.code ?? "unknown"})`);
    return true;
  }
  if (Array.isArray(data) && data.length > 0) {
    await logPostModeration(admin, { communityId: job.communityId, targetType: job.kind, targetId: job.id, result });
  }
  return true;
}

/** Local rules first; otherwise the AI check runs after the response. Returns the status to report. */
export async function moderateInBackground(admin: SupabaseClient, job: PostModerationJob): Promise<"pending" | "held"> {
  if (await holdIfLocalRulesHit(admin, job)) return "held";
  schedulePostModeration(admin, job);
  return "pending";
}

// ── Stale safety net (thread page) ──────────────────────────────────────────

const STALE_AFTER_MS = 2 * 60 * 1000;
const STALE_MAX = 3;
/** Ids scheduled recently by this server instance, so page views don't pile up AI calls. */
const recentlyScheduled = new Map<string, number>();
const RESCHEDULE_AFTER_MS = 3 * 60 * 1000;

/**
 * For at most 3 posts in this thread that are still 'pending' more than
 * 2 minutes after they were last saved, schedule the moderation check again
 * (the original after() may have been cut short). Called by the thread page
 * only after it has confirmed the signed-in viewer can see the thread.
 * Nothing is returned to the page: the service-role results never leave here.
 * Never throws.
 */
export async function scheduleStalePostChecks(thread: {
  id: string;
  communityId: string;
  communityName: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const [threadRes, repliesRes] = await Promise.all([
      admin
        .from("threads")
        .select("id, title, body, edited_at")
        .eq("id", thread.id)
        .eq("status", "pending")
        .lt("updated_at", cutoff)
        .maybeSingle(),
      admin
        .from("replies")
        .select("id, body, edited_at")
        .eq("thread_id", thread.id)
        .eq("status", "pending")
        .lt("updated_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(STALE_MAX),
    ]);

    const jobs: PostModerationJob[] = [];
    const t = threadRes.data as { id: string; title: string; body: string; edited_at: string | null } | null;
    if (t) {
      jobs.push({
        kind: "thread", id: t.id, communityId: thread.communityId, communityName: thread.communityName,
        title: t.title, body: t.body, savedAt: t.edited_at, isEdit: t.edited_at !== null,
      });
    }
    for (const r of (repliesRes.data ?? []) as { id: string; body: string; edited_at: string | null }[]) {
      jobs.push({
        kind: "reply", id: r.id, communityId: thread.communityId, communityName: thread.communityName,
        body: r.body, savedAt: r.edited_at, isEdit: r.edited_at !== null,
      });
    }

    const now = Date.now();
    for (const [id, at] of recentlyScheduled) if (now - at > RESCHEDULE_AFTER_MS) recentlyScheduled.delete(id);
    for (const job of jobs.filter((j) => !recentlyScheduled.has(j.id)).slice(0, STALE_MAX)) {
      recentlyScheduled.set(job.id, now);
      schedulePostModeration(admin, job);
    }
  } catch {
    console.error("[community] stale safety net failed (exception)");
  }
}
