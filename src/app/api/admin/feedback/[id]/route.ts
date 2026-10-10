/**
 * PATCH /api/admin/feedback/[id] — an admin updates one feedback item
 * (docs/phase-3-contracts.md, Phase 3.2 addendum, "Admin side").
 * Request:  { status?: "new"|"looking"|"fixed"|"not_now", adminNote?: string|null, publicReason?: string|null }
 * Response: { ok: true, feedback } | { ok: false, error }
 *
 * Browsers can't write feedback (RLS), so the update uses the service role
 * after requireAdmin(), and every change is recorded with writeAudit().
 * The audit entry never contains the note or the reason text.
 */
import { checkOrigin, fail, json, parseBody, requireAdmin, requireServiceRole, MESSAGES } from "@/app/api/_lib/http";
import { isUuid } from "@/app/api/_lib/guards";
import { writeAudit } from "@/app/api/_lib/audit";
import type { FeedbackStatus } from "@/types";

export const dynamic = "force-dynamic";

const STATUSES: readonly FeedbackStatus[] = ["new", "looking", "fixed", "not_now"];
const NOT_SET_UP = "Feedback isn't set up yet. Please tell the tech team.";

/** Strips control characters (keeps line breaks in notes), trims; "" becomes null. */
function cleanText(v: string, keepNewlines: boolean): string | null {
  // eslint-disable-next-line no-control-regex
  const stripped = keepNewlines ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "") : v.replace(/[\u0000-\u001F\u007F]/g, " ");
  const t = stripped.trim();
  return t ? t : null;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const { id } = await params;
  if (!isUuid(id)) return fail(400, "We couldn't find that feedback.");

  const body = await parseBody(req);
  if (body.response) return body.response;
  const { status, adminNote, publicReason } = body.data;

  const update: Record<string, unknown> = {};

  if (status !== undefined) {
    if (typeof status !== "string" || !STATUSES.includes(status as FeedbackStatus)) {
      return fail(400, "Choose New, Looking into it, Fixed or Not now.");
    }
    update.status = status;
  }
  if (adminNote !== undefined) {
    if (adminNote !== null && typeof adminNote !== "string") return fail(400, "The internal note must be text.");
    const note = adminNote === null ? null : cleanText(adminNote, true);
    if (note && note.length > 1000) return fail(400, "Keep the internal note under 1,000 characters.");
    update.admin_note = note;
  }
  if (publicReason !== undefined) {
    if (publicReason !== null && typeof publicReason !== "string") return fail(400, "The reason must be text.");
    const reason = publicReason === null ? null : cleanText(publicReason, false);
    if (reason && reason.length > 200) return fail(400, "Keep the reason under 200 characters.");
    update.public_reason = reason;
  }
  if (Object.keys(update).length === 0) return fail(400, "Nothing to change.");

  const { data: current, error: readError } = await admin
    .from("feedback").select("id, status").eq("id", id).maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) return fail(503, NOT_SET_UP);
    console.error(`[api/admin/feedback] read failed (${readError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }
  if (!current) return fail(404, "We couldn't find that feedback. It may have been removed. Refresh the page.");

  if (typeof update.status === "string") {
    if (update.status !== "new") {
      // Someone has picked it up: record who and when.
      update.handled_by = auth.user.id;
      update.handled_at = new Date().toISOString();
    }
    // A reason is only shown to the sender for "Not now"; don't leave an old one behind.
    if (update.status !== "not_now" && publicReason === undefined) update.public_reason = null;
  }

  const { data: saved, error: updateError } = await admin
    .from("feedback").update(update).eq("id", id)
    .select("id, status, admin_note, public_reason, handled_by, handled_at, updated_at").maybeSingle();
  if (updateError) {
    if (isMissingTable(updateError)) return fail(503, NOT_SET_UP);
    if (updateError.code === "23514") return fail(400, "One of the values isn't allowed. Check the text and try again.");
    console.error(`[api/admin/feedback] update failed (${updateError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }
  if (!saved) return fail(404, "We couldn't find that feedback. It may have been removed. Refresh the page.");

  await writeAudit(admin, {
    actorId: auth.user.id, action: "feedback.update", targetType: "feedback", targetId: id,
    details: { status: (saved as { status: string }).status },
  });
  return json({ ok: true, feedback: saved });
}
