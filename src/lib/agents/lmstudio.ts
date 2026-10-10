/**
 * LM Studio client: Victor's local models through LM Studio's
 * OpenAI-compatible server (default http://localhost:1234/v1).
 *
 * Used ONLY by the local helper (scripts/local-ai-worker.ts) that runs on
 * Victor's PC. Vercel can't reach LM Studio, so the live site keeps Gemini.
 *
 * Safety:
 *   - LOCALHOST ONLY. checkLocalBaseUrl() refuses any LMSTUDIO_BASE_URL whose
 *     host isn't localhost / 127.0.0.1 / [::1], on every call, and redirects
 *     are refused, so member or page data can never be sent to a remote host
 *     by a mistyped setting.
 *   - No API key. Never logs prompts or answers.
 *   - Output is constrained by a strict JSON schema AND re-validated by the
 *     same validators as Gemini output (callers do that).
 *
 * Returns the same result shape as gemini.ts's generateJson(), so callers can
 * swap providers (see llm.ts). Relative imports only, so tests can load it.
 */
import { emptyUsage, parseJsonOutput, type GeminiUsage } from "./gemini-parse.ts";
import type { GeminiJsonResult, GenerateJsonOptions } from "./gemini.ts";

export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";
/** Local 27B models are slow: allow plenty of time per call. */
// Victor's laptop runs models on the CPU (Iris Xe, no GPU): allow long calls.
export const LMSTUDIO_TIMEOUT_MS = 15 * 60 * 1000;
/** Preferred model when LMSTUDIO_MODEL is unset (matched against GET /v1/models ids). */
// Gemma 4 E4B first: ~30 s per short answer on a CPU-only laptop, where
// Qwen3.8 27B took over 10 minutes (tested 2026-10-10). Qwen is the fallback.
const PREFERRED_MODELS = [/gemma-4-e4b/i, /qwen3\.8.*27b/i];
const MODEL_ID_RE = /^[\w.:/@+-]{1,200}$/;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type LocalUrlCheck = { ok: true; baseUrl: string } | { ok: false; reason: string };

/** Accepts only http(s) URLs on this computer (localhost, 127.0.0.1, [::1]). Pure. */
export function checkLocalBaseUrl(raw: string | undefined | null): LocalUrlCheck {
  const value = (raw ?? "").trim() || DEFAULT_LMSTUDIO_BASE_URL;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, reason: "LMSTUDIO_BASE_URL is not a valid URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "LMSTUDIO_BASE_URL must start with http:// or https://." };
  if (u.username || u.password) return { ok: false, reason: "LMSTUDIO_BASE_URL must not contain a username or password." };
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) {
    return { ok: false, reason: "LMSTUDIO_BASE_URL must point at this computer (localhost, 127.0.0.1 or [::1]). Remote hosts are refused." };
  }
  if (u.search || u.hash) return { ok: false, reason: "LMSTUDIO_BASE_URL must not have a query or #fragment." };
  return { ok: true, baseUrl: u.href.replace(/\/+$/, "") };
}

export interface LmStudioConfig {
  baseUrl: string;
  /** From LMSTUDIO_MODEL, or null to pick from GET /v1/models. */
  model: string | null;
}

/** Reads LMSTUDIO_BASE_URL / LMSTUDIO_MODEL. Throws nothing; returns the guard's reason on a bad URL. */
export function getLmStudioConfig(): { ok: true; config: LmStudioConfig } | { ok: false; reason: string } {
  const check = checkLocalBaseUrl(process.env.LMSTUDIO_BASE_URL);
  if (!check.ok) return check;
  const m = (process.env.LMSTUDIO_MODEL ?? "").trim();
  return { ok: true, config: { baseUrl: check.baseUrl, model: m && MODEL_ID_RE.test(m) ? m : null } };
}

async function localFetch(baseUrl: string, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const check = checkLocalBaseUrl(baseUrl); // re-checked on every call
  if (!check.ok) throw new Error(check.reason);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetch(`${check.baseUrl}${path}`, { ...init, redirect: "error", signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** Model ids LM Studio reports (GET /v1/models), or null when the server isn't reachable. */
export async function listLmStudioModels(baseUrl: string, timeoutMs = 5_000): Promise<string[] | null> {
  try {
    const res = await localFetch(baseUrl, "/models", { method: "GET" }, timeoutMs);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id?: unknown }[] };
    return (json.data ?? []).map((m) => (typeof m.id === "string" ? m.id : "")).filter((id) => MODEL_ID_RE.test(id));
  } catch {
    return null;
  }
}

/** LMSTUDIO_MODEL if set; else Gemma 4 E4B, then Qwen3.8 27B, if listed; else the first listed model. Pure. */
export function pickModel(configured: string | null, available: string[]): string | null {
  if (configured) return configured;
  for (const re of PREFERRED_MODELS) {
    const hit = available.find((id) => re.test(id));
    if (hit) return hit;
  }
  return available[0] ?? null;
}

function mapUsage(u: unknown): GeminiUsage {
  const usage = emptyUsage();
  if (typeof u !== "object" || u === null) return usage;
  const o = u as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  usage.promptTokens = n(o.prompt_tokens);
  usage.outputTokens = n(o.completion_tokens);
  usage.totalTokens = n(o.total_tokens) || usage.promptTokens + usage.outputTokens;
  return usage;
}

/** Interprets a /v1/chat/completions body. Pure, exported for tests. */
export function parseChatCompletion(json: unknown): GeminiJsonResult {
  const root = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const usage = mapUsage(root.usage);
  const choice = Array.isArray(root.choices) && root.choices.length > 0 ? (root.choices[0] as Record<string, unknown>) : null;
  if (!choice) return { ok: false, reason: "bad_json", usage };
  const finish = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
  if (finish === "length") return { ok: false, reason: "max_tokens", usage };
  if (finish === "content_filter") return { ok: false, reason: "blocked", usage };
  const message = typeof choice.message === "object" && choice.message !== null ? (choice.message as Record<string, unknown>) : {};
  // Reasoning models may put their thinking in reasoning_content or <think> tags: never part of the answer.
  const content = typeof message.content === "string" ? message.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() : "";
  if (!content) return { ok: false, reason: "bad_json", usage };
  const parsed = parseJsonOutput(content);
  if (!parsed.ok) return { ok: false, reason: "bad_json", usage };
  return { ok: true, data: parsed.value, usage, finishReason: finish };
}

/** Structured-output call to LM Studio. Same contract as generateJson(): the result is UNTRUSTED, re-validate it. */
export async function lmstudioGenerateJson(
  opts: GenerateJsonOptions,
  override: { baseUrl?: string; model?: string } = {},
): Promise<GeminiJsonResult> {
  const cfg = getLmStudioConfig();
  if (!cfg.ok && !override.baseUrl) {
    console.warn(`[lmstudio] ${cfg.reason}`);
    return { ok: false, reason: "not_configured" };
  }
  const baseUrl = override.baseUrl ?? (cfg.ok ? cfg.config.baseUrl : DEFAULT_LMSTUDIO_BASE_URL);
  const guard = checkLocalBaseUrl(baseUrl);
  if (!guard.ok) {
    console.warn(`[lmstudio] ${guard.reason}`);
    return { ok: false, reason: "not_configured" };
  }

  let model = override.model ?? (cfg.ok ? cfg.config.model : null);
  if (!model) {
    const available = await listLmStudioModels(guard.baseUrl);
    if (!available) return { ok: false, reason: "http_error", errorKind: "server" };
    model = pickModel(null, available);
    if (!model) return { ok: false, reason: "not_configured" };
  }

  const body = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: "result", schema: opts.schema, strict: true } },
    temperature: 0.2,
    max_tokens: opts.maxOutputTokens,
    stream: false,
  };

  let res: Response;
  try {
    res = await localFetch(
      guard.baseUrl,
      "/chat/completions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      opts.timeoutMs,
    );
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    return aborted ? { ok: false, reason: "timeout" } : { ok: false, reason: "http_error", errorKind: "server" };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    console.warn(`[lmstudio] chat/completions failed with HTTP ${res.status}`);
    return { ok: false, reason: "http_error", status: res.status, errorKind: res.status >= 500 ? "server" : "other" };
  }
  try {
    return parseChatCompletion(await res.json());
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}
