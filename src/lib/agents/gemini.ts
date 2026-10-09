/**
 * The ONE place LP9 YPC talks to Google Gemini (lp9-ai-agents skill).
 *
 * - REST over fetch, no SDK. The key goes ONLY in the x-goog-api-key header,
 *   never in the URL (URLs end up in logs).
 * - AbortController timeout covering the whole call, including one retry on
 *   429/500/503.
 * - Never logs prompts, responses or keys.
 *
 * Server-only. Relative imports only, so the unit tests can load it with a
 * stubbed global fetch.
 */
import {
  buildGenerateRequest,
  isRetryableStatus,
  parseGenerateResponse,
  parseJsonOutput,
  type GeminiUsage,
  type GroundingSource,
  type ThinkingLevel,
} from "./gemini-parse.ts";

export type { GeminiUsage, GroundingSource, ThinkingLevel } from "./gemini-parse.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";
const RETRY_BACKOFF_MS = 700;

function resolveModel(raw: string | undefined): string {
  const m = (raw ?? "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(m) ? m : DEFAULT_MODEL;
}

/** Model id: env GEMINI_MODEL (when set and well-formed), else gemini-3.8-flash. */
export const GEMINI_MODEL = resolveModel(process.env.GEMINI_MODEL);

/** The API key, or null when unset — callers then report "not configured". */
export function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export type GeminiFailureReason = "not_configured" | "timeout" | "blocked" | "max_tokens" | "bad_json" | "http_error";

export interface GeminiFailure {
  ok: false;
  reason: GeminiFailureReason;
  status?: number;
  usage?: GeminiUsage;
}

export type GeminiJsonResult =
  | { ok: true; data: unknown; usage: GeminiUsage; finishReason: string | null }
  | GeminiFailure;

export type GeminiGroundedResult =
  | { ok: true; text: string; sources: GroundingSource[]; searchQueries: number; usage: GeminiUsage }
  | GeminiFailure;

export interface GenerateJsonOptions {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  thinkingLevel: ThinkingLevel;
  maxOutputTokens: number;
  timeoutMs: number;
  safetyOff?: boolean;
}

export interface GenerateGroundedOptions {
  system: string;
  user: string;
  timeoutMs: number;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/** POSTs one generateContent request. Returns the parsed JSON body or a failure. */
async function postGenerate(body: Record<string, unknown>, timeoutMs: number): Promise<{ ok: true; json: unknown } | GeminiFailure> {
  const key = getGeminiKey();
  if (!key) return { ok: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const url = `${API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const payload = JSON.stringify(body);

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: payload,
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "timeout" : "http_error" };
      }

      if (res.ok) {
        try {
          return { ok: true, json: await res.json() };
        } catch {
          return { ok: false, reason: controller.signal.aborted ? "timeout" : "bad_json" };
        }
      }

      await res.body?.cancel().catch(() => undefined);
      if (attempt === 0 && isRetryableStatus(res.status)) {
        await sleep(RETRY_BACKOFF_MS, controller.signal);
        if (controller.signal.aborted) return { ok: false, reason: "timeout" };
        continue;
      }
      // Status code only — Google's error bodies can echo request details.
      console.warn(`[gemini] generateContent failed with HTTP ${res.status}`);
      return { ok: false, reason: "http_error", status: res.status };
    }
    return { ok: false, reason: "http_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Structured-output call: returns parsed JSON (still UNTRUSTED — re-validate it). */
export async function generateJson(opts: GenerateJsonOptions): Promise<GeminiJsonResult> {
  const body = buildGenerateRequest({
    system: opts.system,
    user: opts.user,
    schema: opts.schema,
    thinkingLevel: opts.thinkingLevel,
    maxOutputTokens: opts.maxOutputTokens,
    safetyOff: opts.safetyOff,
  });
  const res = await postGenerate(body, opts.timeoutMs);
  if (!res.ok) return res;

  const parsed = parseGenerateResponse(res.json);
  switch (parsed.kind) {
    case "blocked":
      return { ok: false, reason: "blocked", usage: parsed.usage };
    case "max_tokens":
      return { ok: false, reason: "max_tokens", usage: parsed.usage };
    case "empty":
      return { ok: false, reason: "bad_json", usage: parsed.usage };
    case "ok": {
      const json = parseJsonOutput(parsed.text);
      if (!json.ok) return { ok: false, reason: "bad_json", usage: parsed.usage };
      return { ok: true, data: json.value, usage: parsed.usage, finishReason: parsed.finishReason };
    }
  }
}

/** Google Search grounded call (free text + cited sources). No schema — see the skill. */
export async function generateGrounded(opts: GenerateGroundedOptions): Promise<GeminiGroundedResult> {
  const body = buildGenerateRequest({
    system: opts.system,
    user: opts.user,
    googleSearch: true,
    thinkingLevel: opts.thinkingLevel ?? "medium",
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
  });
  const res = await postGenerate(body, opts.timeoutMs);
  if (!res.ok) return res;

  const parsed = parseGenerateResponse(res.json);
  switch (parsed.kind) {
    case "blocked":
      return { ok: false, reason: "blocked", usage: parsed.usage };
    case "max_tokens":
      return { ok: false, reason: "max_tokens", usage: parsed.usage };
    case "empty":
      return { ok: false, reason: "bad_json", usage: parsed.usage };
    case "ok":
      return {
        ok: true,
        text: parsed.text,
        sources: parsed.sources,
        searchQueries: parsed.searchQueries,
        usage: parsed.usage,
      };
  }
}
