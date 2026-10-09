/**
 * POST /api/community/threads — start a conversation (docs/phase-2-contracts.md).
 *
 * Origin check → signed-in user → service role available → valid input →
 * active community → membership → rate limit → moderation → insert with the
 * service role (author and moderation columns set here, never from the body)
 * → moderation_log → 201 { ok, id, status, message }.
 */
import { moderatePost } from "@/lib/agents/moderation";
import { MESSAGES, checkOrigin, fail, json, parseBody, requireServiceRole, requireUser } from "@/app/api/_lib/http";
import { boundedText, isUuid } from "@/app/api/_lib/guards";
import { POST_MESSAGES, claimPostSlot, logPostModeration, moderationColumns, postMessage } from "@/app/api/_lib/community";

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
  const { communityId } = body.data;
  if (!isUuid(communityId)) return fail(400, "Please choose a community.");
  const title = boundedText(body.data.title, 3, 160);
  if (title === null) return fail(400, "Please give your post a title between 3 and 160 characters.");
  const text = boundedText(body.data.body, 1, 5000);
  if (text === null) return fail(400, "Please write your post (up to 5,000 characters).");

  // Session client: RLS shows active communities (admins also see inactive ones, hence the explicit check).
  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, name, is_active")
    .eq("id", communityId)
    .maybeSingle();
  if (communityError) return fail(500, MESSAGES.serverError);
  const c = community as { id: string; name: string; is_active: boolean } | null;
  if (!c || !c.is_active) return fail(404, "We couldn't find that community.");

  const { data: membership, error: memberError } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", c.id)
    .eq("member_id", user.id)
    .maybeSingle();
  if (memberError) return fail(500, MESSAGES.serverError);
  if (!membership) return fail(403, "Join this community to post here.");

  const slot = await claimPostSlot(admin, { authorId: user.id, communityId: c.id, threadId: null, title, body: text });
  if (slot === null) return fail(503, POST_MESSAGES.saveFailed);
  if (slot === "limited") return fail(429, POST_MESSAGES.rateLimited);
  const id = slot;

  const result = await moderatePost({ kind: "thread", title, body: text, communityName: c.name });
  const columns = moderationColumns(result);

  // The post already exists as 'pending' (invisible to others). If this update
  // fails, the moderation sweep picks up the stuck pending post.
  const { error: updateError } = await admin.from("threads").update(columns).eq("id", id);
  if (updateError) {
    console.error(`[api/community/threads] update failed (${updateError.code ?? "unknown"})`);
    return fail(500, POST_MESSAGES.saveFailed);
  }

  await logPostModeration(admin, { communityId: c.id, targetType: "thread", targetId: id, result });

  return json({ ok: true, id, status: columns.status, message: postMessage(columns.status) }, 201);
}
