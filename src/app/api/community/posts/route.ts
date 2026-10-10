/**
 * PATCH /api/community/posts — edit your own post (docs/phase-3-contracts.md).
 * Request: { targetType: "thread" | "reply", targetId, title? (threads), body }.
 *
 * Origin check → signed-in user → service role available → valid input →
 * the post is the caller's own, not removed, not held by a human, and not
 * edited in the last 30 s → community still active and the caller still a
 * member (or moderator) → for replies, the thread still open → update
 * title/body, edited_at = now(), status 'pending' (hidden from others until
 * re-checked; likes and replies stay) → local rules (hold now if hit) →
 * 200 { ok, id, status: "pending" | "held", message }; the AI check runs
 * after the response (schedulePostModeration).
 */
import { MESSAGES, checkOrigin, fail, json, parseBody, requireServiceRole, requireUser } from "@/app/api/_lib/http";
import { boundedText, isUuid } from "@/app/api/_lib/guards";
import { EDIT_COOLDOWN_MS, POST_MESSAGES, moderateInBackground } from "@/app/api/_lib/community";

export const dynamic = "force-dynamic";
/** The background moderation check (after the response) needs up to ~25 s. */
export const maxDuration = 60;

interface PostRow {
  id: string;
  community_id: string;
  author_id: string;
  status: string;
  moderated_by: string | null;
  edited_at: string | null;
  body: string;
  title?: string;
  thread_id?: string;
}

export async function PATCH(req: Request) {
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
  const { targetType, targetId } = body.data;
  if (targetType !== "thread" && targetType !== "reply") return fail(400, "Please say whether this is a discussion or a reply.");
  if (!isUuid(targetId)) return fail(400, "Please choose a post.");
  const isThread = targetType === "thread";

  let title: string | null = null;
  if (isThread) {
    title = boundedText(body.data.title, 3, 160);
    if (title === null) return fail(400, "Please give your post a title between 3 and 160 characters.");
  }
  const text = isThread ? boundedText(body.data.body, 1, 5000) : boundedText(body.data.body, 1, 3000);
  if (text === null) {
    return fail(400, isThread ? "Please write your post (up to 5,000 characters)." : "Please write your reply (up to 3,000 characters).");
  }

  // Service role: authors can't read moderated_by, and we need it to refuse human holds.
  const table = isThread ? "threads" : "replies";
  const columns = isThread
    ? "id, community_id, author_id, status, moderated_by, edited_at, title, body"
    : "id, community_id, author_id, status, moderated_by, edited_at, body, thread_id";
  const { data: postRow, error: postError } = await admin.from(table).select(columns).eq("id", targetId).maybeSingle();
  if (postError) return fail(500, MESSAGES.serverError);
  const post = postRow as PostRow | null;
  if (!post || post.author_id !== user.id) return fail(404, "We couldn't find that post.");
  if (post.status === "removed") return fail(403, "This post has been removed, so it can't be edited.");
  if (post.status === "held" && post.moderated_by === "human") {
    return fail(403, "A community manager is reviewing this post, so it can't be edited right now.");
  }
  if (post.edited_at && Date.now() - new Date(post.edited_at).getTime() < EDIT_COOLDOWN_MS) {
    return fail(429, POST_MESSAGES.editTooSoon);
  }

  const [{ data: community, error: communityError }, { data: canModerate }, { data: membership, error: memberError }, threadRes] =
    await Promise.all([
      supabase.from("communities").select("id, name, is_active").eq("id", post.community_id).maybeSingle(),
      supabase.rpc("can_moderate", { cid: post.community_id }),
      supabase
        .from("community_members")
        .select("role")
        .eq("community_id", post.community_id)
        .eq("member_id", user.id)
        .maybeSingle(),
      post.thread_id
        ? admin.from("threads").select("id, status, is_locked").eq("id", post.thread_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (communityError || memberError || threadRes.error) return fail(500, MESSAGES.serverError);
  const c = community as { id: string; name: string; is_active: boolean } | null;
  if (!c || !c.is_active) return fail(404, "We couldn't find that community.");
  const isModerator = canModerate === true;
  if (!membership && !isModerator) return fail(403, "Join this community to edit your posts here.");
  if (!isThread) {
    const t = threadRes.data as { id: string; status: string; is_locked: boolean } | null;
    if (!t || t.status === "removed") return fail(404, "We couldn't find that conversation.");
    if (t.is_locked && !isModerator) return fail(403, "This discussion is locked, so replies can't be edited.");
  }

  const unchanged = post.body === text && (!isThread || post.title === title);
  if (unchanged) {
    const status = post.status === "held" ? "held" : post.status === "pending" ? "pending" : "visible";
    return json({ ok: true, id: post.id, status, message: "Nothing changed." });
  }

  // Only if nothing changed in between (status, and no other edit got in first).
  const editedAt = new Date().toISOString();
  let update = admin
    .from(table)
    .update({
      ...(isThread ? { title } : {}),
      body: text,
      edited_at: editedAt,
      status: "pending",
      needs_review: false,
      moderation_reason: null,
      moderation_categories: [],
      moderated_by: null,
    })
    .eq("id", post.id)
    .eq("author_id", user.id)
    .eq("status", post.status);
  update = post.edited_at ? update.eq("edited_at", post.edited_at) : update.is("edited_at", null);
  const { data: updated, error: updateError } = await update.select("id");
  if (updateError) {
    console.error(`[api/community/posts] update failed (${updateError.code ?? "unknown"})`);
    return fail(500, POST_MESSAGES.saveFailed);
  }
  if (!Array.isArray(updated) || updated.length === 0) return fail(409, POST_MESSAGES.editTooSoon);

  const status = await moderateInBackground(admin, {
    kind: targetType,
    id: post.id,
    communityId: c.id,
    communityName: c.name,
    ...(isThread && title ? { title } : {}),
    body: text,
  });
  return json({ ok: true, id: post.id, status, message: status === "held" ? POST_MESSAGES.held : POST_MESSAGES.editPending });
}
