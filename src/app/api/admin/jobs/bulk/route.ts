/**
 * POST /api/admin/jobs/bulk — approve or reject many jobs from the Review
 * queue at once (docs/stage-1-contracts.md, section B), or move them back to
 * the queue (the Undo button and "Review again").
 *
 * Request:  { ids: uuid[] (1–100), action: "approve" | "reject" | "restore", reason?: JobRejectReason }
 * Response: { ok: true, approved: string[], rejected: string[], restored: string[],
 *             skipped: { id, title, why: "no_link" | "not_pending" | "already_pending" | "not_found" }[],
 *             reasonSaved: boolean }
 *         | { ok: false, error }
 *
 * - approve: only pending jobs whose Apply link is a safe http(s) URL
 *   (the rest are skipped and reported). Sets is_active = true.
 * - reject:  only pending jobs. Sets is_active = false and reject_reason.
 * - restore: approved/rejected jobs go back to pending (hidden from members).
 * Every call that changes something writes ONE admin_audit row
 * (jobs.bulk_approve / jobs.bulk_reject / jobs.bulk_restore, details {count, reason}).
 * If migration 7 (relevance/reject_reason/reviewed_at) isn't applied yet the
 * update is retried without those columns (reasonSaved: false).
 */
import { checkOrigin, fail, json, parseBody, requireAdmin, requireServiceRole, MESSAGES } from "@/app/api/_lib/http";
import { isUuid } from "@/app/api/_lib/guards";
import { writeAudit } from "@/app/api/_lib/audit";
import { safeHttpUrl } from "@/lib/utils";
import type { JobRejectReason } from "@/types";

export const dynamic = "force-dynamic";

const MAX_IDS = 100;
const ACTIONS = ["approve", "reject", "restore"] as const;
type Action = (typeof ACTIONS)[number];
const REASONS: readonly JobRejectReason[] = ["expired", "not_eligible", "duplicate", "irrelevant", "broken_link", "other"];

type SkipWhy = "no_link" | "not_pending" | "already_pending" | "not_found";
interface JobRow { id: string; title: string; application_link: string | null; review_status: string | null }

/** 42703 = column does not exist; PGRST204 = column not in PostgREST's schema cache. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* (does not exist|schema cache)/i.test(error.message ?? "");
}

export async function POST(req: Request) {
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const body = await parseBody(req);
  if (body.response) return body.response;
  const { ids: rawIds, action: rawAction, reason: rawReason } = body.data;

  if (!Array.isArray(rawIds) || rawIds.length === 0) return fail(400, "Choose at least one job.");
  if (rawIds.length > MAX_IDS) return fail(400, `You can change up to ${MAX_IDS} jobs at a time.`);
  if (!rawIds.every(isUuid)) return fail(400, "One of the chosen jobs wasn't recognised. Refresh the page and try again.");
  const ids = [...new Set((rawIds as string[]).map((id) => id.toLowerCase()))];

  if (typeof rawAction !== "string" || !ACTIONS.includes(rawAction as Action)) {
    return fail(400, "Choose Approve or Reject.");
  }
  const action = rawAction as Action;

  let reason: JobRejectReason | null = null;
  if (action === "reject" && rawReason !== undefined && rawReason !== null) {
    if (typeof rawReason !== "string" || !REASONS.includes(rawReason as JobRejectReason)) {
      return fail(400, "Choose a reason from the list.");
    }
    reason = rawReason as JobRejectReason;
  }

  const { data: rows, error: readError } = await admin
    .from("jobs").select("id, title, application_link, review_status").in("id", ids);
  if (readError) {
    console.error(`[api/admin/jobs/bulk] read failed (${readError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }
  const byId = new Map(((rows ?? []) as JobRow[]).map((r) => [r.id, r]));

  const skipped: { id: string; title: string; why: SkipWhy }[] = [];
  const eligible: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, title: "", why: "not_found" }); continue; }
    const pending = row.review_status === "pending";
    if (action === "restore") {
      if (pending) skipped.push({ id, title: row.title, why: "already_pending" });
      else eligible.push(id);
      continue;
    }
    if (!pending) { skipped.push({ id, title: row.title, why: "not_pending" }); continue; }
    if (action === "approve" && !safeHttpUrl(row.application_link)) { skipped.push({ id, title: row.title, why: "no_link" }); continue; }
    eligible.push(id);
  }

  let changed: string[] = [];
  let reasonSaved = true;
  if (eligible.length > 0) {
    const now = new Date().toISOString();
    const base: Record<string, unknown> =
      action === "approve" ? { review_status: "approved", is_active: true }
      : action === "reject" ? { review_status: "rejected", is_active: false }
      : { review_status: "pending", is_active: false };
    const extra: Record<string, unknown> =
      action === "approve" ? { reject_reason: null, reviewed_at: now }
      : action === "reject" ? { reject_reason: reason, reviewed_at: now }
      : { reject_reason: null, reviewed_at: null };

    // Only rows still in the expected state change, so two admins can't double-handle a job.
    const run = (patch: Record<string, unknown>) => {
      const q = admin.from("jobs").update(patch).in("id", eligible);
      return (action === "restore" ? q.in("review_status", ["approved", "rejected"]) : q.eq("review_status", "pending")).select("id");
    };
    let res = await run({ ...base, ...extra });
    if (res.error && isMissingColumn(res.error)) {
      reasonSaved = false;
      res = await run(base);
    }
    if (res.error) {
      console.error(`[api/admin/jobs/bulk] ${action} failed (${res.error.code ?? "unknown"})`);
      return fail(500, "We couldn't save that change. Nothing was changed. Please try again.");
    }
    changed = ((res.data ?? []) as { id: string }[]).map((r) => r.id);
    const done = new Set(changed);
    for (const id of eligible) {
      if (!done.has(id)) {
        skipped.push({ id, title: byId.get(id)?.title ?? "", why: action === "restore" ? "already_pending" : "not_pending" });
      }
    }
  }

  if (changed.length > 0) {
    await writeAudit(admin, {
      actorId: auth.user.id,
      action: `jobs.bulk_${action}`,
      targetType: "job",
      targetId: changed.length === 1 ? changed[0] : undefined,
      details: action === "reject" ? { count: changed.length, reason } : { count: changed.length },
    });
  }

  return json({
    ok: true,
    approved: action === "approve" ? changed : [],
    rejected: action === "reject" ? changed : [],
    restored: action === "restore" ? changed : [],
    skipped,
    reasonSaved,
  });
}
