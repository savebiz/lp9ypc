/**
 * POST /api/community/replies — reply to a conversation, or to a reply
 * (docs/phase-3-contracts.md). Request: { threadId, body, parentId? }.
 *
 * Origin check → signed-in user → service role available → valid input →
 * thread readable by the caller → active community → membership (or
 * moderator) → thread visible and not locked (moderators may still reply)
 * → parent reply (if any) in the same thread and still there → rate limit +
 * create as 'pending' → set parent_id (the database re-checks it and keeps
 * nesting to 3 levels) → local rules (hold now if hit) → respond 201
 * { ok, id, status: "pending" | "held", message }; the AI check runs after
 * the response (schedulePostModeration).
 */
import { MESSAGES, checkOrigin, fail, json, parseBody, requireServiceRole, requireUser } from "@/app/api/_lib/http";
import { boundedText, isUuid } from "@/app/api/_lib/guards";
import { POST_MESSAGES, claimPostSlot, moderateInBackground } from "@/app/api/_lib/community";

export const dynamic = "force-dynamic";
/** The background moderation check (after the response) needs up to ~25 s. */
export const maxDuration = 60;

const PARENT_GONE = "That reply has been deleted, so yours couldn't be posted.";

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
  const { threadId, parentId } = body.data;
  if (!isUuid(threadId)) return fail(400, "Please choose a conversation to reply to.");
  if (parentId !== undefined && parentId !== null && !isUuid(parentId)) {
    return fail(400, "Please choose a reply to respond to.");
  }
  const text = boundedText(body.data.body, 1, 3000);
  if (text === null) return fail(400, "Please write your reply (up to 3,000 characters).");

  // Session client: RLS returns the thread only if it is visible, the caller's own, or they moderate it.
  const { data: threadRow, error: threadError } = await supabase
    .from("threads")
    .select("id, community_id, status, is_locked")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return fail(500, MESSAGES.serverError);
  const thread = threadRow as { id: string; community_id: string; status: string; is_locked: boolean } | null;
  if (!thread || thread.status === "removed") return fail(404, "We couldn't find that conversation.");

  const [{ data: community, error: communityError }, { data: canModerate }, { data: membership, error: memberError }] =
    await Promise.all([
      supabase.from("communities").select("id, name, is_active").eq("id", thread.community_id).maybeSingle(),
      supabase.rpc("can_moderate", { cid: thread.community_id }),
      supabase
        .from("community_members")
        .select("role")
        .eq("community_id", thread.community_id)
        .eq("member_id", user.id)
        .maybeSingle(),
    ]);
  if (communityError || memberError) return fail(500, MESSAGES.serverError);
  const c = community as { id: string; name: string; is_active: boolean } | null;
  if (!c || !c.is_active) return fail(404, "We couldn't find that community.");

  const isModerator = canModerate === true;
  if (!membership && !isModerator) return fail(403, "Join this community to reply here.");
  if (thread.status !== "visible" && !isModerator) {
    return fail(403, "This conversation isn't open for replies right now.");
  }
  if (thread.is_locked && !isModerator) return fail(403, "This discussion has just been locked, so new replies are closed.");

  // The parent must be a reply in this thread that the caller can see.
  let parent: string | null = null;
  if (typeof parentId === "string") {
    const { data: parentRow, error: parentError } = await admin
      .from("replies")
      .select("id, thread_id, author_id, status")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) return fail(500, MESSAGES.serverError);
    const p = parentRow as { id: string; thread_id: string; author_id: string; status: string } | null;
    if (!p || p.thread_id !== thread.id) return fail(404, PARENT_GONE);
    if (p.status === "removed") return fail(404, PARENT_GONE);
    if (p.status !== "visible" && p.author_id !== user.id && !isModerator) return fail(404, PARENT_GONE);
    parent = p.id;
  }

  const slot = await claimPostSlot(admin, { authorId: user.id, communityId: c.id, threadId: thread.id, title: null, body: text });
  if (slot === null) return fail(503, POST_MESSAGES.saveFailed);
  if (slot === "limited") return fail(429, POST_MESSAGES.rateLimited);
  const id = slot;

  if (parent) {
    // The database trigger checks the parent is in the same thread and keeps
    // the depth at most 2 (re-parenting a reply to a depth-2 reply).
    const { error: parentUpdateError } = await admin.from("replies").update({ parent_id: parent }).eq("id", id);
    if (parentUpdateError) {
      console.error(`[api/community/replies] parent update failed (${parentUpdateError.code ?? "unknown"})`);
      // Don't leave a stray top-level reply the author didn't ask for.
      await admin.from("replies").update({ status: "removed" }).eq("id", id).eq("status", "pending");
      return fail(500, POST_MESSAGES.saveFailed);
    }
  }

  const status = await moderateInBackground(admin, { kind: "reply", id, communityId: c.id, communityName: c.name, body: text, savedAt: null });
  return json({ ok: true, id, status, message: status === "held" ? POST_MESSAGES.held : POST_MESSAGES.pending }, 201);
}
