/**
 * LP9 YPC local AI helper: runs on Victor's Windows PC, uses LM Studio's
 * local models instead of paid Gemini, and writes results to Supabase the
 * same way the Vercel crons do (jobs → admin review queue; career research
 * → suggestions; one agent_runs row per part with trigger "local").
 *
 *   npm run ai:local                  # job sources + career research
 *   npm run ai:local -- --jobs-only
 *   npm run ai:local -- --research-only
 *   npm run ai:local -- --dry-run     # read and think, but write nothing
 *   npm run ai:local -- --retry-failed  # retry failed professions now, not after 24 hours
 *
 * Needs .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY;
 * optional LMSTUDIO_BASE_URL, LMSTUDIO_MODEL). Values are never printed.
 * LM Studio must be on THIS computer: any non-localhost URL is refused.
 * See docs/local-ai.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LM_STUDIO_HELP = "Start LM Studio, load Gemma 4 E4B (unload Qwen3.8 27B: it is too slow on this laptop) and turn on the local server (Developer tab → Start Server), then run this again.";

/** Minimal .env parser (no dependency). Never prints values; never overrides variables already set. */
function loadEnvFile(file: string): number {
  if (!existsSync(file)) return 0;
  let count = 0;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = value;
      count++;
    }
  }
  return count;
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: npm run ai:local -- [--jobs-only] [--research-only] [--dry-run] [--retry-failed]");
  process.exit(0);
}
const jobsOnly = args.has("--jobs-only");
const researchOnly = args.has("--research-only");
const dryRun = args.has("--dry-run");
const retryFailed = args.has("--retry-failed");
if (jobsOnly && researchOnly) {
  console.error("Choose either --jobs-only or --research-only, not both.");
  process.exit(2);
}

loadEnvFile(path.join(ROOT, ".env.local"));
register("./alias-hooks.mjs", import.meta.url);

const { createClient } = await import("@supabase/supabase-js");
const { checkLocalBaseUrl, listLmStudioModels, pickModel } = await import("../src/lib/agents/lmstudio.ts");
const { loadCatalogue, runJobSource } = await import("../src/lib/agents/job-scraper.ts");
const { runCareerResearch } = await import("../src/lib/agents/career-research.ts");
const { startAgentRun, finishAgentRun } = await import("../src/lib/agents/agent-run.ts");
const { addUsage, emptyUsage } = await import("../src/lib/agents/gemini-parse.ts");

const MAX_SOURCES = 10;
const SOURCE_FRESH_MS = 20 * 60 * 60 * 1000; // skip sources that ran fine in the last 20 hours
const PER_SOURCE_MS = 30 * 60 * 1000;
const RESEARCH_BUDGET_MS = 2 * 60 * 60 * 1000;
const MAX_PROFESSIONS = 5;

function line(text = ""): void {
  console.log(text);
}

async function main(): Promise<number> {
  line(`LP9 YPC local AI helper${dryRun ? " (dry run: nothing will be saved)" : ""}`);
  line("");

  // 1. Supabase (service role, same as the crons).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    line("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    return 1;
  }

  // 2. LM Studio on this computer.
  const base = checkLocalBaseUrl(process.env.LMSTUDIO_BASE_URL);
  if (!base.ok) {
    line(base.reason);
    return 1;
  }
  const models = await listLmStudioModels(base.baseUrl);
  if (models === null) {
    line(`LM Studio isn't answering at ${base.baseUrl}.`);
    line(LM_STUDIO_HELP);
    return 1;
  }
  const configured = (process.env.LMSTUDIO_MODEL ?? "").trim() || null;
  const model = pickModel(configured, models);
  if (!model) {
    line("LM Studio is running but no model is loaded.");
    line(LM_STUDIO_HELP);
    return 1;
  }
  if (configured && models.length > 0 && !models.includes(configured)) {
    line(`Note: LMSTUDIO_MODEL "${configured}" isn't in LM Studio's model list; LM Studio may load it on demand.`);
  }
  process.env.LMSTUDIO_MODEL = model; // reuse for every call instead of listing again
  line(`Using local model: ${model}`);
  line("");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let failures = 0;

  // 3. Job sources (AI reader runs locally; structured pages need no AI at all).
  if (!researchOnly) {
    line("== Job sources ==");
    const { data, error } = await admin
      .from("job_sources")
      .select("id, name, url, last_run_at, last_status")
      .eq("is_active", true)
      .order("last_run_at", { ascending: true, nullsFirst: true });
    const catalogue = error ? null : await loadCatalogue(admin);
    if (error || !catalogue) {
      line("Couldn't load job sources or career paths from Supabase.");
      failures++;
    } else {
      const now = Date.now();
      type Src = { id: string; name: string; url: string; last_run_at: string | null; last_status: string | null };
      const due = ((data ?? []) as Src[])
        .filter((s) => !(s.last_status === "ok" || s.last_status === "empty") || !s.last_run_at || now - Date.parse(s.last_run_at) > SOURCE_FRESH_MS)
        .slice(0, MAX_SOURCES);
      if (due.length === 0) {
        line("No job sources are due (all ran fine in the last 20 hours).");
      } else {
        const runId = dryRun ? null : await startAgentRun("job_scraper", { trigger: "local", provider: "lmstudio" }, admin);
        let usage = emptyUsage();
        let found = 0;
        let inserted = 0;
        const summary: Record<string, unknown>[] = [];
        for (const s of due) {
          const started = Date.now();
          const r = await runJobSource(admin, s, { provider: "lmstudio", dryRun, catalogue, deadline: started + PER_SOURCE_MS });
          usage = addUsage(usage, r.usage);
          found += r.found;
          inserted += r.inserted;
          summary.push({ id: s.id, status: r.status, found: r.found, inserted: r.inserted, ...r.details });
          line(`- ${s.name}: ${r.status}. ${r.message} (${Math.round((Date.now() - started) / 1000)} s)`);
        }
        const allFailed = summary.every((x) => x.status === "error");
        if (allFailed) failures++;
        if (!dryRun) {
          await finishAgentRun(
            "job_scraper",
            runId,
            { status: allFailed ? "error" : "ok", itemsProcessed: inserted, usage, error: allFailed ? "All local job-source runs failed." : null, details: { trigger: "local", provider: "lmstudio", sources: summary } },
            admin,
          );
        }
        line(`Jobs: ${found} found, ${inserted} new in the review queue.`);
      }
    }
    line("");
  }

  // 4. Career research from the local model's own knowledge (no web search).
  if (!jobsOnly) {
    line("== Career research (offline knowledge, no web search) ==");
    const runId = dryRun ? null : await startAgentRun("career_research", { trigger: "local", provider: "lmstudio" }, admin);
    const r = await runCareerResearch(admin, { deadline: Date.now() + RESEARCH_BUDGET_MS, provider: "lmstudio", dryRun, maxProfessions: MAX_PROFESSIONS, retryFailedNow: retryFailed });
    const outcomes = (r.details.professions ?? []) as { key: string; status: string; matches?: number; suggestions?: number; error?: string }[];
    for (const o of outcomes) {
      line(`- ${o.key}: ${o.status}${o.status === "done" ? ` (${o.matches ?? 0} matching paths, ${o.suggestions ?? 0} member suggestions)` : o.error ? ` (${o.error})` : ""}`);
    }
    line(r.message);
    if (r.status === "error") failures++;
    if (!dryRun) {
      await finishAgentRun(
        "career_research",
        runId,
        { status: r.status, itemsProcessed: r.processed, usage: r.usage, webSearches: 0, error: r.status === "ok" ? null : r.message, details: { trigger: "local", ...r.details } },
        admin,
      );
    }
    line("");
  }

  line(failures === 0 ? "Done." : "Finished with problems (see above).");
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    console.error(`The local AI helper stopped unexpectedly: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exitCode = 1;
  });
