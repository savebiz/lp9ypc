/**
 * POST /api/community/replies — reply to a conversation (docs/phase-2-contracts.md).
 *
 * Origin check → signed-in user → service role available → valid input →
 * thread readable by the caller → active community → membership (or
 * moderator) → thread visible and not locked (moderators may still reply)
 * → rate limit → moderation → insert with the service role → moderation_log
 * → 201 { ok, id, status, message }.
 */
import { moderatePost } from "@/lib/agents/moderation";
import { MESSAGES, checkOrigin, fail, json, parseBody, requireServiceRole, requireUser } from "@/app/api/_lib/http";
import { boundedText, isUuid } from "@/app/api/_lib/guards";
import { POST_MESSAGES, isRateLimited, logPostModeration, moderationColumns, postMessage } from "@/app/api/_lib/community";

export const dynamic = "force-dynamic";

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
  const { threadId } = body.data;
  if (!isUuid(threadId)) return fail(400, "Please choose a conversation to reply to.");
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

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, name, is_active")
    .eq("id", thread.community_id)
    .maybeSingle();
  if (communityError) return fail(500, MESSAGES.serverError);
  const c = community as { id: string; name: string; is_active: boolean } | null;
  if (!c || !c.is_active) return fail(404, "We couldn't find that community.");

  const [{ data: canModerate }, { data: membership, error: memberError }] = await Promise.all([
    supabase.rpc("can_moderate", { cid: c.id }),
    supabase.from("community_members").select("role").eq("community_id", c.id).eq("member_id", user.id).maybeSingle(),
  ]);
  if (memberError) return fail(500, MESSAGES.serverError);
  const isModerator = canModerate === true;
  if (!membership && !isModerator) return fail(403, "Join this community to reply here.");
  if (thread.status !== "visible" && !isModerator) {
    return fail(403, "This conversation isn't open for replies right now.");
  }
  if (thread.is_locked && !isModerator) return fail(403, "This conversation is locked, so new replies are turned off.");

  const limited = await isRateLimited(admin, user.id);
  if (limited === null) return fail(503, POST_MESSAGES.saveFailed);
  if (limited) return fail(429, POST_MESSAGES.rateLimited);

  const result = await moderatePost({ kind: "reply", body: text, communityName: c.name });
  const columns = moderationColumns(result);

  const { data: inserted, error: insertError } = await admin
    .from("replies")
    .insert({ thread_id: thread.id, community_id: c.id, author_id: user.id, body: text, ...columns })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error(`[api/community/replies] insert failed (${insertError?.code ?? "no row"})`);
    return fail(500, POST_MESSAGES.saveFailed);
  }
  const id = (inserted as { id: string }).id;

  await logPostModeration(admin, { communityId: c.id, targetType: "reply", targetId: id, result });

  return json({ ok: true, id, status: columns.status, message: postMessage(columns.status) }, 201);
}
