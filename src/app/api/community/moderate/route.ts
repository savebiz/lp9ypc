/**
 * POST /api/community/moderate — human moderation actions (docs/phase-2-contracts.md).
 *
 * Request: { action, targetType?, targetId?, reportId?, reason? (≤ 500) }
 * Authorisation (session client): rpc('can_moderate', { cid }) for moderator
 * actions and reports; authorship for delete_own. Writes use the service
 * role, and every action is logged to moderation_log (actor_type 'human').
 */
import { checkOrigin, fail, json, parseBody, requireServiceRole, requireUser, MESSAGES } from "@/app/api/_lib/http";
import { charLength, cleanPostText, isUuid } from "@/app/api/_lib/guards";

export const dynamic = "force-dynamic";

const POST_ACTIONS = ["restore", "hold", "remove", "pin", "unpin", "lock", "unlock", "delete_own"] as const;
const REPORT_ACTIONS = ["report_resolve", "report_dismiss"] as const;
type PostAction = (typeof POST_ACTIONS)[number];
type ReportAction = (typeof REPORT_ACTIONS)[number];

const NOT_MODERATOR = "Only this community's managers can do that.";

function isPostAction(v: unknown): v is PostAction {
  return typeof v === "string" && (POST_ACTIONS as readonly string[]).includes(v);
}
function isReportAction(v: unknown): v is ReportAction {
  return typeof v === "string" && (REPORT_ACTIONS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const body = await parseBody(req);
  if (body.response) return body.response;
  const { action, targetType, targetId, reportId } = body.data;

  let reason: string | null = null;
  if (body.data.reason !== undefined && body.data.reason !== null) {
    const cleaned = cleanPostText(body.data.reason);
    if (cleaned === null || charLength(cleaned) > 500) return fail(400, "Please keep the reason under 500 characters.");
    reason = cleaned || null;
  }

  const canModerate = async (communityId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("can_moderate", { cid: communityId });
    return !error && data === true;
  };
  const log = async (entry: { communityId: string; targetType: "thread" | "reply"; targetId: string; action: string }) => {
    const { error } = await admin.from("moderation_log").insert({
      community_id: entry.communityId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      actor_type: "human",
      actor_id: user.id,
      action: entry.action,
      reason,
    });
    if (error) console.error(`[api/community/moderate] moderation_log insert failed (${error.code ?? "unknown"})`);
  };

  // ── Reports ────────────────────────────────────────────────────────────
  if (isReportAction(action)) {
    if (!isUuid(reportId)) return fail(400, "Please choose a report.");
    const { data: reportRow, error } = await admin
      .from("reports")
      .select("id, community_id, target_type, target_id")
      .eq("id", reportId)
      .maybeSingle();
    if (error) return fail(500, MESSAGES.serverError);
    const report = reportRow as { id: string; community_id: string; target_type: "thread" | "reply"; target_id: string } | null;
    if (!report) return fail(404, "We couldn't find that report.");
    if (!(await canModerate(report.community_id))) return fail(403, NOT_MODERATOR);

    const { error: updateError } = await admin
      .from("reports")
      .update({
        status: action === "report_resolve" ? "resolved" : "dismissed",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", report.id);
    if (updateError) return fail(500, MESSAGES.serverError);
    await log({ communityId: report.community_id, targetType: report.target_type, targetId: report.target_id, action });
    return json({ ok: true });
  }

  // ── Posts ──────────────────────────────────────────────────────────────
  if (!isPostAction(action)) return fail(400, "That moderation action isn't recognised.");
  if (targetType !== "thread" && targetType !== "reply") return fail(400, "Please say whether this is a conversation or a reply.");
  if (!isUuid(targetId)) return fail(400, "Please choose a post.");
  if ((action === "pin" || action === "unpin" || action === "lock" || action === "unlock") && targetType !== "thread") {
    return fail(400, "Only conversations can be pinned or locked.");
  }

  const table = targetType === "thread" ? "threads" : "replies";
  const { data: postRow, error: postError } = await admin
    .from(table)
    .select("id, community_id, author_id, status")
    .eq("id", targetId)
    .maybeSingle();
  if (postError) return fail(500, MESSAGES.serverError);
  const post = postRow as { id: string; community_id: string; author_id: string; status: string } | null;
  if (!post) return fail(404, "We couldn't find that post.");

  let update: Record<string, unknown>;
  if (action === "delete_own") {
    if (post.author_id !== user.id) return fail(403, "You can only delete your own posts.");
    update = { status: "removed" };
  } else {
    if (!(await canModerate(post.community_id))) return fail(403, NOT_MODERATOR);

    if ((action === "restore" || action === "hold") && post.status === "removed") {
      // Respect an author's own deletion: managers can't bring it back.
      const { data: deleted } = await admin
        .from("moderation_log")
        .select("id")
        .eq("target_id", post.id)
        .eq("action", "delete_own")
        .limit(1);
      if (deleted && deleted.length > 0) return fail(403, "The author deleted this post, so it can't be brought back.");
    }

    const humanDecision = { needs_review: false, moderated_by: "human", ...(reason ? { moderation_reason: reason } : {}) };
    switch (action) {
      case "restore":
        update = { status: "visible", ...humanDecision };
        break;
      case "hold":
        update = { status: "held", ...humanDecision };
        break;
      case "remove":
        update = { status: "removed", ...humanDecision };
        break;
      case "pin":
      case "unpin":
        update = { is_pinned: action === "pin" };
        break;
      case "lock":
      case "unlock":
        update = { is_locked: action === "lock" };
        break;
    }
  }

  const { error: updateError } = await admin.from(table).update(update).eq("id", post.id);
  if (updateError) {
    console.error(`[api/community/moderate] update failed (${updateError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }
  await log({ communityId: post.community_id, targetType, targetId: post.id, action });
  return json({ ok: true });
}
