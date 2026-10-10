/**
 * Contract module for Phase 3 instant posting (docs/phase-3-contracts.md).
 *
 * Routes (threads, replies, post edits) and the thread page's stale safety net
 * call schedulePostModeration() after saving a post as 'pending'. The logic
 * lives in post-moderation-run.ts (no Next imports, so it is unit-tested);
 * this file only adds Next's after() scheduling.
 *
 * Server-only: pass the SERVICE-ROLE client.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runPostModeration, type PostModerationJob } from "./post-moderation-run.ts";

export {
  runPostModeration,
  moderationColumns,
  logPostModeration,
  type PostModerationJob,
  type PostModerationColumns,
} from "./post-moderation-run.ts";

/**
 * Runs the moderation check after the response has been sent (Next's after()).
 * Must be called inside a route handler, server action or server component.
 * Never throws: if after() is unavailable here, the post stays 'pending' and
 * the daily sweep / stale safety net checks it later.
 */
export function schedulePostModeration(admin: SupabaseClient, job: PostModerationJob): void {
  try {
    after(async () => {
      await runPostModeration(admin, job);
    });
  } catch {
    console.error("[post-moderation] could not schedule the check (after() unavailable here)");
  }
}
