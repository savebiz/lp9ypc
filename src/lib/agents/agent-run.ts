/**
 * agent_runs logging: every cron or batch run writes one row (lp9-ai-agents).
 * Uses the SERVICE-ROLE client. Logging failures never break a run.
 * Never put secrets or member personal data in `error` or `details`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentRun } from "@/types";
import { runTokens, type GeminiUsage } from "./gemini-parse.ts";

export type AgentName = AgentRun["agent"];

export interface AgentRunOutcome {
  status: "ok" | "error" | "skipped";
  itemsProcessed?: number;
  usage?: GeminiUsage;
  webSearches?: number;
  error?: string | null;
  details?: Record<string, unknown>;
}

function client(admin?: SupabaseClient | null): SupabaseClient | null {
  return admin ?? createAdminClient();
}

/** Inserts a 'running' row and returns its id (null if logging isn't possible). */
export async function startAgentRun(
  agent: AgentName,
  details: Record<string, unknown> = {},
  admin?: SupabaseClient | null,
): Promise<string | null> {
  const db = client(admin);
  if (!db) return null;
  const { data, error } = await db.from("agent_runs").insert({ agent, status: "running", details }).select("id").single();
  if (error) {
    console.error(`[agent-run] could not start ${agent} run (${error.code ?? "unknown"})`);
    return null;
  }
  return (data as { id: string }).id;
}

/** Completes the row from startAgentRun(), or inserts a complete row if starting failed. */
export async function finishAgentRun(
  agent: AgentName,
  runId: string | null,
  outcome: AgentRunOutcome,
  admin?: SupabaseClient | null,
): Promise<void> {
  const db = client(admin);
  if (!db) return;
  const tokens = outcome.usage ? runTokens(outcome.usage) : { input: 0, output: 0 };
  const row = {
    status: outcome.status,
    finished_at: new Date().toISOString(),
    items_processed: outcome.itemsProcessed ?? 0,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    web_searches: outcome.webSearches ?? 0,
    error: outcome.error ? outcome.error.slice(0, 2000) : null,
    details: outcome.details ?? {},
  };
  const { error } = runId
    ? await db.from("agent_runs").update(row).eq("id", runId)
    : await db.from("agent_runs").insert({ agent, ...row });
  if (error) console.error(`[agent-run] could not finish ${agent} run (${error.code ?? "unknown"})`);
}
