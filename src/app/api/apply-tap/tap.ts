/**
 * Pure helpers for POST /api/apply-tap (docs/stage-2-contracts.md, section A).
 * No "next/*" or "@/" imports, so `node --test` can run them
 * (tests/agents/apply-tap.test.ts).
 */

export const APPLY_SOURCES = ["card", "detail", "dashboard", "welcome"] as const;
export type ApplySource = (typeof APPLY_SOURCES)[number];

/** A tap body is `{ jobId, source }`: tiny, so anything bigger is refused unread. */
export const APPLY_TAP_MAX_BYTES = 512;

/** A repeat tap on the same job from the same IP within this window isn't counted again. */
export const APPLY_TAP_DEDUPE_MS = 10 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isApplySource(v: unknown): v is ApplySource {
  return typeof v === "string" && (APPLY_SOURCES as readonly string[]).includes(v);
}

/** `{ jobId, source }` from a parsed body, or null if either is wrong. */
export function parseApplyTap(data: Record<string, unknown>): { jobId: string; source: ApplySource } | null {
  const { jobId, source } = data;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId) || !isApplySource(source)) return null;
  return { jobId: jobId.toLowerCase(), source };
}

/**
 * The caller's IP for de-duplication only (never stored). On Vercel the first
 * x-forwarded-for entry is the client; falls back to x-real-ip, then "unknown"
 * (all unknown callers then share one bucket — acceptable for best effort).
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

/**
 * Best-effort, per-server-instance memory of recent taps. Serverless instances
 * don't share it and it resets on cold starts, so it only trims obvious
 * double-taps; it is not a security control.
 */
export class TapDeduper {
  private seen = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  // Plain fields, not parameter properties: node --test runs this file with type stripping only.
  constructor(windowMs = APPLY_TAP_DEDUPE_MS, maxEntries = 5000) {
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  /** True if this key should be counted now (and remembers it); false for a repeat inside the window. */
  shouldCount(key: string, now = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    if (this.seen.size >= this.maxEntries) this.prune(now);
    this.seen.set(key, now);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [k, t] of this.seen) {
      if (now - t >= this.windowMs) this.seen.delete(k);
    }
    // Still full (a burst of distinct taps): drop the oldest half. Maps keep insertion order.
    if (this.seen.size >= this.maxEntries) {
      let drop = Math.ceil(this.seen.size / 2);
      for (const k of this.seen.keys()) {
        if (drop-- <= 0) break;
        this.seen.delete(k);
      }
    }
  }
}

/** Missing table/function: migration 20261106120000 isn't applied yet. */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}
