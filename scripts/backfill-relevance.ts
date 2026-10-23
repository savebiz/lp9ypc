/**
 * LP9 YPC — one-off backfill for the Stage 1 review queue
 * (docs/stage-1-contracts.md section A). The tech lead runs it once, after
 * migration 20261023120000_job_review.sql is applied:
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backfill-relevance.ts --dry-run
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backfill-relevance.ts
 *
 * For every PENDING job it computes jobs.relevance with the job finder's own
 * scoreJob(), and sets aside jobs not open to applicants in Nigeria as
 * review_status 'rejected', reject_reason 'not_eligible', reviewed_at now()
 * (is_active false, like an admin rejection). Approved and rejected jobs are
 * never touched; every update is guarded by review_status = 'pending', so an
 * admin's decision made meanwhile wins. --dry-run reads and reports only.
 *
 * Needs .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Values are never printed. The summary shows job titles/locations only
 * (public job data), never member data. Writes one agent_runs row.
 */
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env parser (no dependency). Never prints values; never overrides variables already set. */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
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
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backfill-relevance.ts [--dry-run]");
  process.exit(0);
}
const unknown = [...args].filter((a) => a !== "--dry-run");
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(" ")}. Use --dry-run or nothing.`);
  process.exit(2);
}
const dryRun = args.has("--dry-run");

loadEnvFile(path.join(ROOT, ".env.local"));
register("./alias-hooks.mjs", import.meta.url);

const { createClient } = await import("@supabase/supabase-js");
const { isMissingColumn, loadMembersPerPath, planBackfill, PENDING_MAX_AGE_DAYS } = await import(
  "../src/lib/agents/job-relevance.ts"
);
const { lagosToday } = await import("../src/lib/agents/job-validate.ts");
const { startAgentRun, finishAgentRun } = await import("../src/lib/agents/agent-run.ts");

type Row = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  work_mode: string | null;
  deadline: string | null;
  description: string | null;
  career_path_id: string | null;
  source_id: string | null;
  created_at: string | null;
};

const PAGE = 1000;
const ID_CHUNK = 150;

function line(text = ""): void {
  console.log(text);
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function main(): Promise<number> {
  line(`LP9 YPC relevance backfill${dryRun ? " (dry run: nothing will be saved)" : ""}`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    line("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    return 1;
  }
  let projectRef = "unknown";
  try {
    projectRef = new URL(url).hostname.split(".")[0];
  } catch {
    // shown as "unknown"
  }
  line(`Supabase project: ${projectRef} (check this is the LP9 project before a real run)`);
  line("");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  // 1. Is the Stage 1 migration applied?
  const probe = await admin.from("jobs").select("relevance, reject_reason, reviewed_at").limit(1);
  const columnsMissing = isMissingColumn(probe.error);
  if (probe.error && !columnsMissing) {
    line(`Couldn't read jobs (${probe.error.code ?? "unknown"}).`);
    return 1;
  }
  if (columnsMissing) {
    line("The relevance / reject_reason / reviewed_at columns aren't there yet: apply migration 20261023120000_job_review.sql first.");
    if (!dryRun) return 1;
    line("Continuing the dry run anyway (scores are computed in memory).");
    line("");
  }

  // 2. Context: member demand per career path, path and source names.
  const membersPerPath = await loadMembersPerPath(admin);
  const paths = await admin.from("career_paths").select("id, slug");
  const pathSlug = new Map(((paths.data ?? []) as { id: string; slug: string }[]).map((p) => [p.id, p.slug]));
  const sources = await admin.from("job_sources").select("id, name");
  const sourceName = new Map(((sources.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const today = lagosToday();

  // 3. Every pending job.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("jobs")
      .select("id, title, company, location, work_mode, deadline, description, career_path_id, source_id, created_at")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      line(`Couldn't read pending jobs (${error.code ?? "unknown"}).`);
      return 1;
    }
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const plan = planBackfill(rows, { membersPerPath, today });

  // 4. Summary.
  const src = (id: string | null | undefined) => (id ? sourceName.get(id) ?? "unknown source" : "no source");
  line(`Pending jobs: ${rows.length}`);
  line(`Member demand per path: ${[...pathSlug.entries()].map(([id, slug]) => `${slug} ${membersPerPath[id] ?? 0}`).join(", ") || "none"}`);
  line("");
  const bySource = new Map<string, { total: number; notEligible: number; sum: number }>();
  for (const { row, result } of plan.all) {
    const s = bySource.get(src(row.source_id)) ?? { total: 0, notEligible: 0, sum: 0 };
    s.total++;
    s.sum += result.score;
    if (!result.eligible) s.notEligible++;
    bySource.set(src(row.source_id), s);
  }
  line("By source (pending, not eligible, average score):");
  for (const [name, s] of bySource) line(`- ${name}: ${s.total} pending, ${s.notEligible} not eligible, average ${Math.round(s.sum / s.total)}`);
  line("");

  const kinds: Record<string, number> = {};
  for (const { kind } of plan.all) kinds[kind] = (kinds[kind] ?? 0) + 1;
  line(`Location: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);

  const buckets = [0, 0, 0, 0, 0];
  for (const { result } of plan.all) if (result.eligible) buckets[Math.min(4, Math.floor(result.score / 20))]++;
  line(`Scores of the jobs that stay pending: 0–19: ${buckets[0]}, 20–39: ${buckets[1]}, 40–59: ${buckets[2]}, 60–79: ${buckets[3]}, 80–100: ${buckets[4]}`);
  const exact = [...plan.scores.entries()].sort((a, b) => b[0] - a[0]).map(([s, ids]) => `${s}×${ids.length}`);
  line(`Exact scores (score×jobs): ${exact.join(", ") || "none"}`);
  line("");

  line(`Not eligible (would be set aside as 'not_eligible'): ${plan.notEligible.length}`);
  for (const n of plan.notEligible.slice(0, 30)) {
    line(`- [${src(n.row.source_id)}] ${n.row.title ?? "(no title)"} | ${n.row.location ?? "(no location)"} | ${n.reason}`);
  }
  if (plan.notEligible.length > 30) line(`  …and ${plan.notEligible.length - 30} more`);
  line("");

  // Informational: what the next job-finder run's auto-expiry would take out.
  const cutoff = Date.now() - PENDING_MAX_AGE_DAYS * 86_400_000;
  const expiring = rows.filter(
    (r) => (r.created_at && Date.parse(r.created_at) < cutoff) || (r.deadline && r.deadline.slice(0, 10) < today),
  ).length;
  line(`For information: ${expiring} pending job${expiring === 1 ? "" : "s"} would be expired by the next job-finder run (older than ${PENDING_MAX_AGE_DAYS} days or past the closing date).`);
  line("");

  if (dryRun) {
    line("Dry run finished. Nothing was saved.");
    return 0;
  }

  // 5. Write: relevance for eligible jobs (one update per score value), then the set-asides.
  const runId = await startAgentRun("job_scraper", { trigger: "backfill_relevance" }, admin);
  let scored = 0;
  let rejected = 0;
  let errors = 0;
  for (const [score, ids] of plan.scores) {
    for (const part of chunks(ids, ID_CHUNK)) {
      const { data, error } = await admin.from("jobs").update({ relevance: score }).in("id", part).eq("review_status", "pending").select("id");
      if (error) {
        errors++;
        line(`Couldn't save scores (${error.code ?? "unknown"}).`);
      } else scored += (data ?? []).length;
    }
  }
  const nowIso = new Date().toISOString();
  const byScore = new Map<number, string[]>();
  for (const n of plan.notEligible) byScore.set(n.score, [...(byScore.get(n.score) ?? []), n.id]);
  for (const [score, ids] of byScore) {
    for (const part of chunks(ids, ID_CHUNK)) {
      const { data, error } = await admin
        .from("jobs")
        .update({ relevance: score, review_status: "rejected", is_active: false, reject_reason: "not_eligible", reviewed_at: nowIso })
        .in("id", part)
        .eq("review_status", "pending")
        .select("id");
      if (error) {
        errors++;
        line(`Couldn't set jobs aside (${error.code ?? "unknown"}).`);
      } else rejected += (data ?? []).length;
    }
  }

  await finishAgentRun(
    "job_scraper",
    runId,
    {
      status: errors > 0 ? "error" : "ok",
      itemsProcessed: scored + rejected,
      error: errors > 0 ? `${errors} backfill update(s) failed.` : null,
      details: { trigger: "backfill_relevance", pending: rows.length, scored, not_eligible: rejected, buckets },
    },
    admin,
  );
  line(`Saved: ${scored} scored and kept pending, ${rejected} set aside as not eligible${errors ? `, ${errors} failed updates` : ""}.`);
  return errors > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    console.error(`The backfill stopped unexpectedly: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exitCode = 1;
  });
