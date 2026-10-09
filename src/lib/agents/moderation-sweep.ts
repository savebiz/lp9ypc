/**
 * Daily moderation sweep: re-checks posts that were published while the
 * moderation assistant was unavailable (needs_review = true) and any post
 * stuck in the transient 'pending' status for more than 5 minutes.
 *
 * - allow → visible, needs_review false;  hold → held (a manager decides).
 * - Still unavailable → visible posts stay as they are (and stay flagged);
 *   stuck 'pending' posts are published with needs_review = true (fail open).
 * - Updates are conditional on the status we read, so a human decision made
 *   in the meantime is never overwritten.
 * - Every decision is written to moderation_log (actor_type 'agent').
 *
 * Server-only (service-role client), called by /api/cron/moderation-sweep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGeminiKey } from "./gemini.ts";
import { addUsage, emptyUsage, type GeminiUsage } from "./gemini-parse.ts";
import { moderatePostDetailed } from "./moderation.ts";

export const MAX_POSTS_PER_SWEEP = 25;
const PENDING_GRACE_MS = 5 * 60 * 1000;
const CONCURRENCY = 5;

interface SweepPost {
  kind: "thread" | "reply";
  id: string;
  community_id: string;
  title?: string;
  body: string;
  status: string;
  created_at: string;
}

export interface SweepResult {
  status: "ok" | "error" | "skipped";
  processed: number;
  usage: GeminiUsage;
  message: string;
  details: Record<string, unknown>;
}

async function loadCandidates(admin: SupabaseClient): Promise<SweepPost[] | null> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString();
  const tables = [
    { kind: "thread" as const, table: "threads", cols: "id, community_id, title, body, status, created_at" },
    { kind: "reply" as const, table: "replies", cols: "id, community_id, body, status, created_at" },
  ];
  const found = new Map<string, SweepPost>();
  for (const t of tables) {
    const [flagged, stuck] = await Promise.all([
      admin
        .from(t.table)
        .select(t.cols)
        .eq("needs_review", true)
        .in("status", ["visible", "pending"])
        .order("created_at")
        .limit(MAX_POSTS_PER_SWEEP),
      admin
        .from(t.table)
        .select(t.cols)
        .eq("status", "pending")
        .lt("created_at", cutoff)
        .order("created_at")
        .limit(MAX_POSTS_PER_SWEEP),
    ]);
    if (flagged.error || stuck.error) {
      console.error(`[moderation-sweep] could not load ${t.table} (${flagged.error?.code ?? stuck.error?.code ?? "unknown"})`);
      return null;
    }
    const rows = [...(flagged.data ?? []), ...(stuck.data ?? [])] as unknown as Omit<SweepPost, "kind">[];
    for (const row of rows) found.set(`${t.kind}:${row.id}`, { ...row, kind: t.kind });
  }
  return [...found.values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, MAX_POSTS_PER_SWEEP);
}

/** Runs one sweep. `deadline` (epoch ms) keeps the cron inside maxDuration. Never throws. */
export async function runModerationSweep(admin: SupabaseClient, opts: { deadline: number }): Promise<SweepResult> {
  let usage = emptyUsage();
  if (!getGeminiKey()) {
    return { status: "skipped", processed: 0, usage, message: "GEMINI_API_KEY is not set; posts stay flagged for review.", details: {} };
  }

  try {
    const posts = await loadCandidates(admin);
    if (!posts) return { status: "error", processed: 0, usage, message: "Could not load posts to re-check.", details: {} };
    if (posts.length === 0) return { status: "ok", processed: 0, usage, message: "Nothing to re-check.", details: { checked: 0 } };

    const communityIds = [...new Set(posts.map((p) => p.community_id))];
    const { data: comms } = await admin.from("communities").select("id, name").in("id", communityIds);
    const names = new Map(((comms ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name] as [string, string]));

    const counts = { allowed: 0, held: 0, published_flagged: 0, unavailable: 0, changed_meanwhile: 0, errors: 0 };

    const handle = async (post: SweepPost) => {
      const table = post.kind === "thread" ? "threads" : "replies";
      const result = await moderatePostDetailed({
        kind: post.kind,
        title: post.title,
        body: post.body,
        communityName: names.get(post.community_id) ?? "Community",
      });
      usage = addUsage(usage, result.usage);

      let update: Record<string, unknown>;
      let action: "allow" | "hold" | "flag";
      if (result.source === "unavailable") {
        if (post.status !== "pending") {
          counts.unavailable++;
          return;
        }
        update = { status: "visible", needs_review: true };
        action = "flag";
      } else if (result.decision === "hold") {
        update = {
          status: "held",
          needs_review: false,
          moderated_by: "agent",
          moderation_reason: result.reason.slice(0, 500) || null,
          moderation_categories: result.categories,
        };
        action = "hold";
      } else {
        update = { status: "visible", needs_review: false, moderated_by: "agent", moderation_reason: null, moderation_categories: [] };
        action = "allow";
      }

      const { data, error } = await admin
        .from(table)
        .update(update)
        .eq("id", post.id)
        .eq("status", post.status)
        .select("id");
      if (error) {
        counts.errors++;
        console.error(`[moderation-sweep] update failed (${error.code ?? "unknown"})`);
        return;
      }
      if (!data || data.length === 0) {
        counts.changed_meanwhile++;
        return;
      }

      if (action === "allow") counts.allowed++;
      else if (action === "hold") counts.held++;
      else counts.published_flagged++;

      const { error: logError } = await admin.from("moderation_log").insert({
        community_id: post.community_id,
        target_type: post.kind,
        target_id: post.id,
        actor_type: action === "flag" ? "system" : "agent",
        actor_id: null,
        action,
        reason:
          action === "flag"
            ? "Published after the automatic check stayed unavailable; still needs review."
            : (result.reason || (action === "allow" ? "Re-checked by the moderation assistant." : "")).slice(0, 500) || null,
      });
      if (logError) console.error(`[moderation-sweep] log insert failed (${logError.code ?? "unknown"})`);
    };

    let processed = 0;
    for (let i = 0; i < posts.length; i += CONCURRENCY) {
      if (opts.deadline - Date.now() < 10_000) break; // leave room to finish cleanly
      const batch = posts.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((p) => handle(p).catch(() => void counts.errors++)));
      processed += batch.length;
    }

    return {
      status: "ok",
      processed,
      usage,
      message: `Re-checked ${processed} post${processed === 1 ? "" : "s"}: ${counts.allowed} allowed, ${counts.held} held.`,
      details: { checked: processed, queued: posts.length, ...counts },
    };
  } catch (e) {
    console.error(`[moderation-sweep] run failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return { status: "error", processed: 0, usage, message: "The sweep failed unexpectedly.", details: {} };
  }
}
