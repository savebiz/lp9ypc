/**
 * POST /api/feedback — a member reports a problem or shares an idea
 * (docs/phase-3-contracts.md, Phase 3.2 addendum).
 *
 * Origin check → signed-in user → service role available → valid input →
 * honeypot → target exists (session client, so RLS decides what the member can
 * see) → local rules (silently dropped if hit) → submit_feedback() with the
 * service role (rate limit + de-duplication) → 201 { ok, id }.
 *
 * Body: { kind, message?, pagePath?, targetType?, targetId?, website? }.
 * The submitter is always the verified user, never from the body. No AI call.
 */
import { MESSAGES, checkOrigin, fail, json, parseBody, requireServiceRole, requireUser } from "@/app/api/_lib/http";
import { boundedText, charLength, cleanPostText, isUuid } from "@/app/api/_lib/guards";
import { SITE } from "@/content/site";
import {
  FEEDBACK_COPY,
  FEEDBACK_LIMITS,
  isFeedbackKind,
  isFeedbackTargetType,
  sameSitePath,
} from "@/components/feedback/feedback";
import type { FeedbackTargetType } from "@/types";

export const dynamic = "force-dynamic";

const TARGET_TABLES: Record<FeedbackTargetType, string> = {
  job: "jobs",
  announcement: "announcements",
  career_path: "career_paths",
  community: "communities",
};

const NOT_SET_UP = `Feedback isn't switched on yet. Please email ${SITE.contactEmail} instead.`;

/** Missing table/function (migration not applied yet). */
function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
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
  const data = body.data;

  // Honeypot: real members never see this field. Pretend it worked.
  if (typeof data.website === "string" && data.website.trim() !== "") return json({ ok: true }, 201);

  const { kind } = data;
  if (!isFeedbackKind(kind)) return fail(400, "Please choose what kind of feedback this is.");

  let message = "";
  if (data.message !== undefined && data.message !== null) {
    const cleaned = boundedText(data.message, 0, FEEDBACK_LIMITS.message);
    if (cleaned === null) {
      const raw = cleanPostText(data.message);
      return fail(
        400,
        raw !== null && charLength(raw) > FEEDBACK_LIMITS.message
          ? `Please keep your note to ${FEEDBACK_LIMITS.message} characters.`
          : "Please check your note and try again.",
      );
    }
    message = cleaned;
  }
  if (kind === "idea" && charLength(message) < FEEDBACK_LIMITS.ideaMin) {
    return fail(400, "Please tell us your idea in a few words.");
  }

  let pagePath: string | null = null;
  if (data.pagePath !== undefined && data.pagePath !== null && data.pagePath !== "") {
    pagePath = sameSitePath(data.pagePath);
    if (pagePath === null) return fail(400, "We couldn't tell which page this is about. Please go back and try again.");
  }

  let targetType: FeedbackTargetType | null = null;
  let targetId: string | null = null;
  const hasType = data.targetType !== undefined && data.targetType !== null;
  const hasId = data.targetId !== undefined && data.targetId !== null;
  if (hasType || hasId) {
    if (!isFeedbackTargetType(data.targetType) || !isUuid(data.targetId)) {
      return fail(400, "We couldn't tell what this is about. Please go back and try again.");
    }
    targetType = data.targetType;
    targetId = data.targetId;
    // Session client: the member can only point at things they're allowed to see.
    const { data: found, error } = await supabase.from(TARGET_TABLES[targetType]).select("id").eq("id", targetId).maybeSingle();
    if (error) return fail(500, MESSAGES.serverError);
    if (!found) return fail(404, "We couldn't find what this is about. It may have been removed.");
  }

  // No spam filter here on purpose: feedback is members-only, rate-limited and
  // read only by admins, and a note like "this job asks for a registration
  // fee" is exactly the report we want (it would trip the post rules).

  const { data: id, error } = await admin.rpc("submit_feedback", {
    p_submitter: user.id,
    p_kind: kind,
    p_message: message || null,
    p_page_path: pagePath,
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) {
    if (isMissing(error)) return fail(503, NOT_SET_UP);
    console.error("[feedback] submit_feedback failed:", error.code, error.message);
    return fail(500, MESSAGES.serverError);
  }
  if (!id) return fail(429, FEEDBACK_COPY.rateLimited);

  return json({ ok: true, id: String(id) }, 201);
}
