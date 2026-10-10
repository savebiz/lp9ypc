/**
 * POST /api/admin/job-sources/[id]/run — admins run one job source now.
 * Response: { ok: true, status: "ok"|"empty"|"blocked"|"error", found, inserted, message }
 *
 * Found jobs land as review_status 'pending' (never auto-published). The run
 * is logged to agent_runs with trigger "manual". A body is optional; if one
 * is sent it must be JSON.
 */
import { runJobSource } from "@/lib/agents/job-scraper";
import { finishAgentRun, startAgentRun } from "@/lib/agents/agent-run";
import { checkOrigin, fail, json, parseBody, requireAdmin, requireServiceRole, MESSAGES } from "@/app/api/_lib/http";
import { isUuid } from "@/app/api/_lib/guards";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const body = await parseBody(req, { allowEmpty: true });
  if (body.response) return body.response;

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "We couldn't find that job source.");

  const { data, error } = await admin.from("job_sources").select("id, name, url").eq("id", id).maybeSingle();
  if (error) return fail(500, MESSAGES.serverError);
  const source = data as { id: string; name: string; url: string } | null;
  if (!source) return fail(404, "We couldn't find that job source.");

  const runId = await startAgentRun("job_scraper", { trigger: "manual", sources: 1 }, admin);
  const result = await runJobSource(admin, source, { deadline: started + 55_000 });
  await finishAgentRun(
    "job_scraper",
    runId,
    {
      status: result.status === "error" ? "error" : "ok",
      itemsProcessed: result.inserted,
      usage: result.usage,
      error: result.status === "error" ? result.message : null,
      details: { trigger: "manual", sources: [{ id: source.id, status: result.status, found: result.found, inserted: result.inserted, ...result.details }] },
    },
    admin,
  );

  await (await import("@/app/api/_lib/audit")).writeAudit(admin, { actorId: auth.user.id, action: "job_source.run", targetType: "job_source", targetId: source.id, details: { status: result.status, inserted: result.inserted } });
  return json({ ok: true, status: result.status, found: result.found, inserted: result.inserted, message: result.message });
}
