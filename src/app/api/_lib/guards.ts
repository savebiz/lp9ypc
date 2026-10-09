/**
 * Pure request guards shared by the API routes: same-origin check, capped
 * JSON body parsing, constant-time cron auth and input helpers.
 *
 * No "next/*" or "@/" imports, so `node --test` can run it
 * (tests/agents/guards.test.ts). The `_lib` folder is private to the App
 * Router (underscore prefix) — nothing here is a route.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MAX_JSON_BYTES = 20 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** The Origin header must exactly match the origin of the request URL (CSRF defence). */
export function isSameOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader || originHeader === "null") return false;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export type JsonBodyResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Reads a JSON object body, refusing non-JSON content types and anything
 * over `maxBytes` (streamed — a missing or lying Content-Length can't bypass
 * the cap). With `allowEmpty`, a request with no body yields {}.
 */
export async function readJsonBody(
  req: Request,
  opts: { maxBytes?: number; allowEmpty?: boolean } = {},
): Promise<JsonBodyResult> {
  const maxBytes = opts.maxBytes ?? MAX_JSON_BYTES;
  const tooLarge: JsonBodyResult = { ok: false, status: 413, error: "That's too long to send. Please shorten it and try again." };
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const declared = Number(req.headers.get("content-length") ?? "NaN");

  if (opts.allowEmpty && !contentType && (!req.body || declared === 0)) return { ok: true, data: {} };
  if (contentType !== "application/json") {
    return { ok: false, status: 415, error: "Please send the request as JSON." };
  }
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!req.body) {
    return opts.allowEmpty ? { ok: true, data: {} } : { ok: false, status: 400, error: "The request was empty." };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return tooLarge;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  const text = new TextDecoder("utf-8").decode(bytes).trim();
  if (!text) return opts.allowEmpty ? { ok: true, data: {} } : { ok: false, status: 400, error: "The request was empty." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "The request wasn't valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "The request wasn't in the expected format." };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

/**
 * Constant-time check of `Authorization: Bearer <secret>`. Both sides are
 * hashed first so neither the comparison time nor a length mismatch leaks
 * anything about the secret.
 */
export function bearerMatches(authorizationHeader: string | null, secret: string): boolean {
  const expected = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  const given = createHash("sha256").update(authorizationHeader ?? "", "utf8").digest();
  return timingSafeEqual(expected, given);
}

/** 503 when CRON_SECRET is unset (never run unauthenticated), 401 on a wrong token, 200 when OK. */
export function cronAuthStatus(authorizationHeader: string | null, secret: string | undefined): 200 | 401 | 503 {
  if (!secret || !secret.trim()) return 503;
  return bearerMatches(authorizationHeader, secret) ? 200 : 401;
}

/** Postgres char_length() semantics: Unicode code points, not UTF-16 units. */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** Trims, drops NUL and other control characters (keeps newlines/tabs), normalises line endings. */
export function cleanPostText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/** A cleaned string whose length (code points) is within [min, max], else null. */
export function boundedText(v: unknown, min: number, max: number): string | null {
  const s = cleanPostText(v);
  if (s === null) return null;
  const n = charLength(s);
  return n >= min && n <= max ? s : null;
}
