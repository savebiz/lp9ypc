/**
 * GET /api/cron/moderation-sweep — daily 04:00 UTC (vercel.json).
 * Authorization: Bearer $CRON_SECRET (constant-time check; 503 if unset).
 *
 * Re-checks up to 25 posts that were published while the moderation
 * assistant was unavailable (needs_review) or got stuck in 'pending'.
 * Writes one agent_runs row.
 */
import { runModerationSweep } from "@/lib/agents/moderation-sweep";
import { finishAgentRun, startAgentRun } from "@/lib/agents/agent-run";
import { checkCron, json, requireServiceRole } from "@/app/api/_lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const started = Date.now();
  const denied = checkCron(req);
  if (denied) return denied;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const runId = await startAgentRun("moderation_sweep", { trigger: "cron" }, admin);
  const result = await runModerationSweep(admin, { deadline: started + 55_000 });
  await finishAgentRun(
    "moderation_sweep",
    runId,
    {
      status: result.status,
      itemsProcessed: result.processed,
      usage: result.usage,
      error: result.status === "ok" ? null : result.message,
      details: { trigger: "cron", ...result.details },
    },
    admin,
  );

  return json(
    { ok: result.status !== "error", status: result.status, processed: result.processed, message: result.message },
    result.status === "error" ? 500 : 200,
  );
}
