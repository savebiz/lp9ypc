/**
 * Request builder and response parser for the Gemini generateContent REST API
 * (lp9-ai-agents skill). gemini.ts does the network part.
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */

export type ThinkingLevel = "low" | "medium" | "high";

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  toolUsePromptTokens: number;
  totalTokens: number;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface GenerateRequestOptions {
  /** Instructions only — never untrusted text. */
  system: string;
  /** Untrusted data, already wrapped in delimiters with fenceUntrusted(). */
  user: string;
  /** JSON Schema for structured output (responseJsonSchema). Not allowed with googleSearch. */
  schema?: Record<string, unknown>;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  /** Moderation only: lets the model READ harmful posts in order to classify them. */
  safetyOff?: boolean;
  /** Career research only: Google Search grounding. */
  googleSearch?: boolean;
}

export type ParsedGemini =
  | {
      kind: "ok";
      text: string;
      finishReason: string | null;
      usage: GeminiUsage;
      sources: GroundingSource[];
      searchQueries: number;
    }
  | { kind: "blocked"; reason: string; usage: GeminiUsage }
  | { kind: "max_tokens"; usage: GeminiUsage }
  | { kind: "empty"; usage: GeminiUsage };

/** finishReason values that mean Google blocked the output. */
export const BLOCKED_FINISH_REASONS: readonly string[] = [
  "SAFETY",
  "PROHIBITED_CONTENT",
  "SPII",
  "BLOCKLIST",
  "RECITATION",
  "IMAGE_SAFETY",
];

const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
];

export const MAX_SOURCES = 6;

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

export function emptyUsage(): GeminiUsage {
  return { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, toolUsePromptTokens: 0, totalTokens: 0 };
}

export function mapUsage(meta: unknown): GeminiUsage {
  if (!isObj(meta)) return emptyUsage();
  return {
    promptTokens: num(meta.promptTokenCount),
    outputTokens: num(meta.candidatesTokenCount),
    thoughtsTokens: num(meta.thoughtsTokenCount),
    toolUsePromptTokens: num(meta.toolUsePromptTokenCount),
    totalTokens: num(meta.totalTokenCount),
  };
}

export function addUsage(a: GeminiUsage, b: GeminiUsage | undefined): GeminiUsage {
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    thoughtsTokens: a.thoughtsTokens + b.thoughtsTokens,
    toolUsePromptTokens: a.toolUsePromptTokens + b.toolUsePromptTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** agent_runs columns: input = prompt + tool-use prompt; output = answer + thinking (both billed as output). */
export function runTokens(u: GeminiUsage): { input: number; output: number } {
  return { input: u.promptTokens + u.toolUsePromptTokens, output: u.outputTokens + u.thoughtsTokens };
}

export function buildGenerateRequest(o: GenerateRequestOptions): Obj {
  if (o.schema && o.googleSearch) {
    // Google's docs: don't combine grounding with a response schema in one call.
    throw new Error("buildGenerateRequest: schema and googleSearch cannot be combined");
  }
  const generationConfig: Obj = {};
  if (o.schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = o.schema;
  }
  if (o.maxOutputTokens) generationConfig.maxOutputTokens = o.maxOutputTokens;
  if (o.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: o.thinkingLevel };

  const body: Obj = {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ text: o.user }] }],
    generationConfig,
  };
  if (o.googleSearch) body.tools = [{ googleSearch: {} }];
  if (o.safetyOff) {
    body.safetySettings = SAFETY_CATEGORIES.map((category) => ({ category, threshold: "BLOCK_NONE" }));
  }
  return body;
}

/** http(s) sources from groundingMetadata.groundingChunks[].web, de-duplicated, at most MAX_SOURCES. */
export function extractSources(groundingMetadata: unknown): { sources: GroundingSource[]; searchQueries: number } {
  if (!isObj(groundingMetadata)) return { sources: [], searchQueries: 0 };
  const searchQueries = Array.isArray(groundingMetadata.webSearchQueries)
    ? groundingMetadata.webSearchQueries.length
    : 0;
  const sources: GroundingSource[] = [];
  const seen = new Set<string>();
  const chunks = Array.isArray(groundingMetadata.groundingChunks) ? groundingMetadata.groundingChunks : [];
  for (const chunk of chunks) {
    if (sources.length >= MAX_SOURCES) break;
    const web = isObj(chunk) && isObj(chunk.web) ? chunk.web : null;
    if (!web || typeof web.uri !== "string") continue;
    let url: URL;
    try {
      url = new URL(web.uri);
    } catch {
      continue;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) continue;
    if (url.href.length > 2000 || seen.has(url.href)) continue;
    seen.add(url.href);
    const title = typeof web.title === "string" && web.title.trim() ? web.title.trim().slice(0, 200) : url.hostname;
    sources.push({ title, url: url.href });
  }
  return { sources, searchQueries };
}

/** Interprets a generateContent response body. */
export function parseGenerateResponse(json: unknown): ParsedGemini {
  const root = isObj(json) ? json : {};
  const usage = mapUsage(root.usageMetadata);

  const feedback = isObj(root.promptFeedback) ? root.promptFeedback : null;
  if (feedback && typeof feedback.blockReason === "string" && feedback.blockReason) {
    return { kind: "blocked", reason: feedback.blockReason, usage };
  }

  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = candidates.length > 0 && isObj(candidates[0]) ? candidates[0] : null;
  if (!first) return { kind: "empty", usage };

  const finishReason = typeof first.finishReason === "string" ? first.finishReason : null;
  if (finishReason && BLOCKED_FINISH_REASONS.includes(finishReason)) {
    return { kind: "blocked", reason: finishReason, usage };
  }
  if (finishReason === "MAX_TOKENS") return { kind: "max_tokens", usage };

  const content = isObj(first.content) ? first.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .filter((p): p is Obj => isObj(p) && p.thought !== true && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
  if (!text.trim()) return { kind: "empty", usage };

  const { sources, searchQueries } = extractSources(first.groundingMetadata);
  return { kind: "ok", text, finishReason, usage, sources, searchQueries };
}

/** JSON.parse with a guard for stray code fences. Never throws. */
export function parseJsonOutput(text: string): { ok: true; value: unknown } | { ok: false } {
  let s = String(text ?? "").replace(/^﻿/, "").trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fenced) s = fenced[1];
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

/** Tag names we use as delimiters around untrusted text. */
const DELIMITER_TAGS = "post|title|body|community|page_text|page_url|profession|research";

/**
 * Neutralises our delimiter tags inside untrusted text, so a post or page
 * can't "close" its <post>/<page_text> block and smuggle in instructions.
 */
export function fenceUntrusted(text: string): string {
  return String(text ?? "").replace(new RegExp(`<(\\s*\\/?\\s*)(${DELIMITER_TAGS})\\b`, "gi"), "‹$1$2");
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

/**
 * What kind of HTTP failure Gemini returned. Decides whether a retry (or the
 * fallback model) can help:
 *   - "quota":      429 that won't clear by waiting a few seconds (daily cap,
 *                   "limit: 0", or "check your plan and billing"). Never retried.
 *   - "rate_limit": 429 per-minute limit. Retried; the fallback model may help.
 *   - "overloaded": 503, or any 5xx that says the model is overloaded. Retried;
 *                   the fallback model is tried once.
 *   - "server":     other 5xx (500/502/504). Retried.
 *   - "other":      anything else (400, 401, 403, 404…). Not retried.
 */
export type GeminiErrorKind = "quota" | "rate_limit" | "overloaded" | "server" | "other";

export interface GeminiErrorInfo {
  kind: GeminiErrorKind;
  /** RetryInfo.retryDelay from Google, when present. */
  retryDelayMs?: number;
}

/**
 * Classifies a failed generateContent response from its status and (capped)
 * error body. Pure. The body is only inspected, never logged — Google's error
 * bodies can echo request details.
 */
export function classifyGeminiError(status: number, bodyText: string): GeminiErrorInfo {
  const body = String(bodyText ?? "").slice(0, 16_384);
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  const retryDelayMs = delay ? Math.round(Number(delay[1]) * 1000) : undefined;

  if (status === 429) {
    const perMinute = /PerMinute|per[ _-]minute/i.test(body);
    const hardCap = /limit:\s*0\b|PerDay|per[ _-]day|daily/i.test(body);
    const billing = /billing|check your plan/i.test(body);
    if (hardCap) return { kind: "quota", retryDelayMs };
    if (perMinute) return { kind: "rate_limit", retryDelayMs };
    if (billing) return { kind: "quota", retryDelayMs };
    return { kind: "rate_limit", retryDelayMs };
  }
  if (status >= 500 && status <= 599) {
    if (status === 503 || /overloaded|UNAVAILABLE/i.test(body)) return { kind: "overloaded", retryDelayMs };
    return { kind: "server", retryDelayMs };
  }
  return { kind: "other" };
}
