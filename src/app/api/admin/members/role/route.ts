/**
 * POST /api/admin/members/role — admins make a member an admin, or remove admin access.
 * Request:  { memberId: uuid, role: "admin" | "member" }
 * Response: { ok: true, role, changed } | { ok: false, error }
 *
 * Members can't change profiles.role (column grants), so the write uses the
 * service role after requireAdmin(). The last admin can never be demoted.
 * Logs go to the server console only, without member details.
 */
import { checkOrigin, fail, json, parseBody, requireAdmin, requireServiceRole, MESSAGES } from "@/app/api/_lib/http";
import { isUuid } from "@/app/api/_lib/guards";

export const dynamic = "force-dynamic";

const LAST_ADMIN = "You can't remove the last admin. Make someone else an admin first.";

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
  const { memberId, role } = body.data;
  if (!isUuid(memberId)) return fail(400, "Please choose a member.");
  if (role !== "admin" && role !== "member") return fail(400, "Choose either admin or member.");

  const { data: target, error: readError } = await admin
    .from("profiles").select("id, role").eq("id", memberId).maybeSingle();
  if (readError) {
    console.error(`[api/admin/members/role] read failed (${readError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }
  if (!target) return fail(404, "We couldn't find that member.");
  if ((target as { role: string }).role === role) return json({ ok: true, role, changed: false });

  const countAdmins = async () => {
    const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    return error ? null : (count ?? 0);
  };

  if (role === "member") {
    const before = await countAdmins();
    if (before === null) return fail(500, MESSAGES.serverError);
    if (before <= 1) return fail(409, LAST_ADMIN);
  }

  const { error: updateError } = await admin
    .from("profiles").update({ role }).eq("id", memberId).eq("role", role === "admin" ? "member" : "admin");
  if (updateError) {
    console.error(`[api/admin/members/role] update failed (${updateError.code ?? "unknown"})`);
    return fail(500, MESSAGES.serverError);
  }

  // Two admins demoting each other at the same moment could both pass the
  // check above. Re-count and undo if that left the club with no admin.
  if (role === "member") {
    const after = await countAdmins();
    if (after === 0) {
      await admin.from("profiles").update({ role: "admin" }).eq("id", memberId);
      return fail(409, LAST_ADMIN);
    }
  }

  console.info(`[api/admin/members/role] role changed to ${role} by an admin`);
  return json({ ok: true, role, changed: true });
}
