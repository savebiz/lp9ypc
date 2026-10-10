/**
 * GET /api/cron/job-scraper — daily 06:00 UTC (vercel.json).
 * Authorization: Bearer $CRON_SECRET (constant-time check; 503 if unset).
 *
 * Structured job data (JSON-LD / RSS) is read first without AI; Gemini is
 * only a fallback. Runs at most 3 active sources (least recently run first), in parallel
 * within one 55 s budget. Found jobs land as review_status 'pending'.
 * Writes one agent_runs row.
 */
import { MAX_SOURCES_PER_RUN, loadCatalogue, runJobSource } from "@/lib/agents/job-scraper";
import { finishAgentRun, startAgentRun } from "@/lib/agents/agent-run";
import { addUsage, emptyUsage } from "@/lib/agents/gemini-parse";
import { checkCron, fail, json, requireServiceRole } from "@/app/api/_lib/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const started = Date.now();
  const denied = checkCron(req);
  if (denied) return denied;

  const service = requireServiceRole();
  if (service.response) return service.response;
  const { admin } = service;

  const runId = await startAgentRun("job_scraper", { trigger: "cron" }, admin);

  // No Gemini key is fine: sources with structured job data (JSON-LD / RSS)
  // are read without AI; the others report it in their last_error.
  const { data, error } = await admin
    .from("job_sources")
    .select("id, name, url")
    .eq("is_active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_SOURCES_PER_RUN);
  const catalogue = error ? null : await loadCatalogue(admin);
  if (error || !catalogue) {
    const message = error ? "Could not load job sources." : "Could not load career paths.";
    await finishAgentRun("job_scraper", runId, { status: "error", error: message, details: { trigger: "cron" } }, admin);
    return fail(500, message);
  }

  const sources = (data ?? []) as { id: string; name: string; url: string }[];
  if (sources.length === 0) {
    await finishAgentRun("job_scraper", runId, { status: "ok", details: { trigger: "cron", sources: [] } }, admin);
    return json({ ok: true, status: "ok", sources: 0, found: 0, inserted: 0, message: "No active job sources." });
  }

  const deadline = started + 55_000;
  const results = await Promise.all(sources.map((s) => runJobSource(admin, s, { deadline, catalogue })));

  const usage = results.reduce((acc, r) => addUsage(acc, r.usage), emptyUsage());
  const found = results.reduce((n, r) => n + r.found, 0);
  const inserted = results.reduce((n, r) => n + r.inserted, 0);
  const allFailed = results.every((r) => r.status === "error");
  const summary = sources.map((s, i) => ({
    id: s.id,
    status: results[i].status,
    found: results[i].found,
    inserted: results[i].inserted,
    ...results[i].details,
  }));

  await finishAgentRun(
    "job_scraper",
    runId,
    {
      status: allFailed ? "error" : "ok",
      itemsProcessed: inserted,
      usage,
      error: allFailed ? results.map((r) => r.message).join(" | ") : null,
      details: { trigger: "cron", sources: summary },
    },
    admin,
  );

  return json({
    ok: true,
    status: allFailed ? "error" : "ok",
    sources: sources.length,
    found,
    inserted,
    results: sources.map((s, i) => ({ id: s.id, status: results[i].status, found: results[i].found, inserted: results[i].inserted })),
  });
}
