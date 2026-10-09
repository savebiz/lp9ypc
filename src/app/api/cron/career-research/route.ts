/**
 * GET /api/cron/career-research — daily 03:00 UTC (vercel.json).
 * Authorization: Bearer $CRON_SECRET (constant-time check; 503 if unset).
 *
 * Researches at most 5 professions (profession text only — never member
 * identity) and writes suggestions / candidates for admins and members to
 * review. Writes one agent_runs row.
 */
import { runCareerResearch } from "@/lib/agents/career-research";
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

  const runId = await startAgentRun("career_research", { trigger: "cron" }, admin);
  const result = await runCareerResearch(admin, { deadline: started + 55_000 });
  await finishAgentRun(
    "career_research",
    runId,
    {
      status: result.status,
      itemsProcessed: result.processed,
      usage: result.usage,
      webSearches: result.webSearches,
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
