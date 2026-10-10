/**
 * GET /api/cron/link-check — daily 05:00 UTC (vercel.json).
 * Authorization: Bearer $CRON_SECRET (constant-time check; 503 if unset).
 *
 * Flag only: checks due Apply links (two strikes before filing an item) and
 * files "found by the assistant" items for past closing dates and past
 * events. Never modifies jobs or announcements. No AI. One agent_runs row.
 */
import { runLinkCheck } from "@/lib/agents/link-check";
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

  const runId = await startAgentRun("link_check", { trigger: "cron" }, admin);
  // Stop starting new checks at 45 s: one in flight can take 8 s, plus the writes.
  const result = await runLinkCheck(admin, { deadline: started + 45_000 });
  await finishAgentRun(
    "link_check",
    runId,
    {
      status: result.status,
      itemsProcessed: result.processed,
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
