/**
 * The ONE place LP9 YPC talks to Google Gemini (lp9-ai-agents skill).
 *
 * - REST over fetch, no SDK. The key goes ONLY in the x-goog-api-key header,
 *   never in the URL (URLs end up in logs).
 * - One AbortController timeout covers the whole call (the caller's budget),
 *   including retries.
 * - Resilience (Phase 3): 429 per-minute limits and 5xx are retried with
 *   exponential backoff (or Google's RetryInfo delay) while the budget lasts.
 *   A 429 "quota / check your plan and billing" error is NOT retried: waiting
 *   won't fix it. When GEMINI_FALLBACK_MODEL is set, it is tried once if the
 *   primary model is overloaded (503) or per-minute rate limited (429).
 * - Failures carry the HTTP status and an errorKind so callers can tell
 *   "busy, try later" (503/timeout) from "needs billing" (429 quota).
 * - Never logs prompts, responses, error bodies or keys.
 *
 * Server-only. Relative imports only, so the unit tests can load it with a
 * stubbed global fetch.
 */
import {
  buildGenerateRequest,
  classifyGeminiError,
  parseGenerateResponse,
  parseJsonOutput,
  type GeminiErrorKind,
  type GeminiUsage,
  type GroundingSource,
  type ThinkingLevel,
} from "./gemini-parse.ts";

export type { GeminiErrorKind, GeminiUsage, GroundingSource, ThinkingLevel } from "./gemini-parse.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";
const RETRY_BASE_MS = 800;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_ATTEMPTS = 4;
/** Don't start another attempt with less than this much budget left. */
const MIN_ATTEMPT_MS = 2_500;
const MAX_ERROR_BODY_CHARS = 16_384;

const MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function resolveModel(raw: string | undefined): string {
  const m = (raw ?? "").trim();
  return MODEL_RE.test(m) ? m : DEFAULT_MODEL;
}

/** Model id: env GEMINI_MODEL (when set and well-formed), else gemini-3.8-flash. */
export const GEMINI_MODEL = resolveModel(process.env.GEMINI_MODEL);

/** Optional fallback model (env GEMINI_FALLBACK_MODEL), or null. Read per call so tests can set it. */
export function getFallbackModel(): string | null {
  const m = (process.env.GEMINI_FALLBACK_MODEL ?? "").trim();
  return MODEL_RE.test(m) && m !== GEMINI_MODEL ? m : null;
}

/** The API key, or null when unset; callers then report "not configured". */
export function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export type GeminiFailureReason = "not_configured" | "timeout" | "blocked" | "max_tokens" | "bad_json" | "http_error";

export interface GeminiFailure {
  ok: false;
  reason: GeminiFailureReason;
  /** Last HTTP status Google returned (also kept on a timeout that followed a 429/503). */
  status?: number;
  /** Classification of the last HTTP failure (see classifyGeminiError). */
  errorKind?: GeminiErrorKind;
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

/** True when the key has no usable quota (429 "check your plan and billing", daily cap, limit 0). */
export function isQuotaFailure(f: GeminiFailure): boolean {
  return f.errorKind === "quota";
}

/** True when Google was busy or slow (503/5xx, per-minute 429, network, timeout); worth trying later. */
export function isBusyFailure(f: GeminiFailure): boolean {
  if (f.reason === "timeout") return true;
  return f.reason === "http_error" && (f.errorKind === "overloaded" || f.errorKind === "server" || f.errorKind === "rate_limit");
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

/** Reads (and caps) an error body for classification only. Never logged. */
async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, MAX_ERROR_BODY_CHARS);
  } catch {
    return "";
  }
}

/** POSTs one generateContent request (with retries/fallback). Returns the parsed JSON body or a failure. */
async function postGenerate(body: Record<string, unknown>, timeoutMs: number): Promise<{ ok: true; json: unknown } | GeminiFailure> {
  const key = getGeminiKey();
  if (!key) return { ok: false, reason: "not_configured" };

  const budget = Math.max(1, timeoutMs);
  const deadline = Date.now() + budget;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const payload = JSON.stringify(body);
  const fallback = getFallbackModel();

  let fallbackUsed = false;
  let useFallbackNext = false;
  let lastStatus: number | undefined;
  let lastKind: GeminiErrorKind | undefined;
  const failure = (reason: GeminiFailureReason): GeminiFailure => {
    const f: GeminiFailure = { ok: false, reason };
    if (lastStatus !== undefined) f.status = lastStatus;
    if (lastKind !== undefined) f.errorKind = lastKind;
    return f;
  };

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const model = useFallbackNext && fallback ? fallback : GEMINI_MODEL;
      useFallbackNext = false;
      const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

      let res: Response | null = null;
      let retryDelayMs: number | undefined;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: payload,
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        if (controller.signal.aborted) return failure("timeout");
        // Network blip: treat like a server error and retry while the budget lasts.
        lastKind = "server";
      }

      if (res) {
        if (res.ok) {
          try {
            return { ok: true, json: await res.json() };
          } catch {
            return failure(controller.signal.aborted ? "timeout" : "bad_json");
          }
        }
        const info = classifyGeminiError(res.status, await readErrorBody(res));
        lastStatus = res.status;
        lastKind = info.kind;
        retryDelayMs = info.retryDelayMs;
        // Status and kind only: Google's error bodies can echo request details.
        console.warn(
          `[gemini] generateContent failed with HTTP ${res.status} (${info.kind}, ${model === GEMINI_MODEL ? "primary" : "fallback"} model)`,
        );
        if (info.kind === "quota" || info.kind === "other") return failure("http_error");
      }

      // Retryable. Try the fallback model once when the primary is overloaded or rate limited.
      let wait: number;
      if (fallback && !fallbackUsed && model === GEMINI_MODEL && (lastKind === "overloaded" || lastKind === "rate_limit")) {
        fallbackUsed = true;
        useFallbackNext = true;
        wait = 300;
      } else if (retryDelayMs !== undefined) {
        wait = retryDelayMs;
      } else {
        const backoff = Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_MS * 2 ** attempt);
        wait = Math.round(backoff * (0.85 + Math.random() * 0.3));
      }
      if (attempt === MAX_ATTEMPTS - 1 || deadline - Date.now() - wait < MIN_ATTEMPT_MS) {
        return failure(lastStatus === undefined ? "timeout" : "http_error");
      }
      await sleep(wait, controller.signal);
      if (controller.signal.aborted) return failure("timeout");
    }
    return failure("http_error");
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
