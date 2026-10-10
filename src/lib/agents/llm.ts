/**
 * Provider switch for structured-output calls: Google Gemini (cloud, used by
 * the live site's crons) or LM Studio (Victor's local models, used only by
 * scripts/local-ai-worker.ts on his PC). Both return the same result shape,
 * and callers keep using the same schemas and validators.
 */
import { generateJson, getGeminiKey, type GeminiJsonResult, type GenerateJsonOptions } from "./gemini.ts";
import { LMSTUDIO_TIMEOUT_MS, lmstudioGenerateJson } from "./lmstudio.ts";

export type LlmProvider = "gemini" | "lmstudio";

/** Display name used in admin-facing messages. */
export function providerLabel(p: LlmProvider): string {
  return p === "lmstudio" ? "the local AI (LM Studio)" : "Gemini";
}

/** True when the provider can be tried at all (Gemini needs a key; LM Studio is checked when called). */
export function providerConfigured(p: LlmProvider): boolean {
  return p === "lmstudio" ? true : getGeminiKey() !== null;
}

/** Per-call timeout to use for a provider: local models get at least LMSTUDIO_TIMEOUT_MS. */
export function providerTimeout(p: LlmProvider, cloudMs: number): number {
  return p === "lmstudio" ? Math.max(cloudMs, LMSTUDIO_TIMEOUT_MS) : cloudMs;
}

export async function generateJsonVia(provider: LlmProvider, opts: GenerateJsonOptions): Promise<GeminiJsonResult> {
  return provider === "lmstudio" ? lmstudioGenerateJson(opts) : generateJson(opts);
}
