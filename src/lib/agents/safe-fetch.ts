/**
 * SSRF-safe fetch for admin-supplied URLs (lp9-safe-scraping skill).
 *
 * Every hop (the first URL and each redirect, at most 3):
 *   1–2. checkPublicUrl(): http(s) only, no credentials, port 80/443, no local names.
 *   3.   DNS lookup of ALL addresses; reject if ANY is private/reserved.
 *   4.   redirect: "manual" — we follow redirects ourselves and re-check.
 * Limits: one 15 s AbortController timeout for the whole fetch, 2 MB body cap
 * (streamed; reading stops at the cap), content-type allow-list, identifying UA.
 *
 * KNOWN RESIDUAL RISK (accepted for MVP, admin-supplied URLs only): DNS
 * rebinding between our lookup and fetch's own connect. Node's fetch can't be
 * pinned to the address we checked without a custom dispatcher/dependency.
 *
 * Server-only. Relative imports only; network functions are injectable so the
 * unit tests never touch the network.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { checkPublicUrl, checkResolvedAddresses } from "./safe-url.ts";

export const BOT_USER_AGENT = "LP9YPC-JobBot/1.0 (+https://lp9ypc.vercel.app/about)";
export const PAGE_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

export interface SafeFetchDeps {
  lookup: (host: string) => Promise<{ address: string }[]>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}

export const defaultFetchDeps: SafeFetchDeps = {
  lookup: (host) => dnsLookup(host, { all: true, verbatim: true }),
  fetch: (url, init) => globalThis.fetch(url, init),
};

export type SafeFetchFailure =
  | "invalid_url"
  | "blocked_address"
  | "dns_error"
  | "timeout"
  | "too_many_redirects"
  | "http_error"
  | "bad_content_type"
  | "network_error";

export type SafeFetchResult =
  | { ok: true; finalUrl: string; status: number; contentType: string; body: string; truncated: boolean }
  | { ok: false; reason: SafeFetchFailure; status?: number; detail: string };

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  contentTypes?: string[];
  maxRedirects?: number;
}

/** dns.lookup can't be aborted, so race it against the timeout signal. */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already closed
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes, truncated };
}

function decode(bytes: Uint8Array, contentTypeHeader: string): string {
  const charset = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentTypeHeader)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Fetches a public web page as text, enforcing every rule in the scraping skill. Never throws. */
export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
  deps: SafeFetchDeps = defaultFetchDeps,
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
  const contentTypes = opts.contentTypes ?? PAGE_CONTENT_TYPES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const timedOut = (): SafeFetchResult => ({ ok: false, reason: "timeout", detail: "The site took too long to respond." });

  try {
    let current = rawUrl;
    for (let hop = 0; ; hop++) {
      const check = checkPublicUrl(current);
      if (!check.ok) {
        return { ok: false, reason: check.code === "blocked" ? "blocked_address" : "invalid_url", detail: check.reason };
      }

      let addresses: { address: string }[];
      try {
        addresses = await raceAbort(deps.lookup(check.host), controller.signal);
      } catch {
        if (controller.signal.aborted) return timedOut();
        return { ok: false, reason: "dns_error", detail: "The site's address could not be found." };
      }
      const resolved = checkResolvedAddresses(addresses.map((a) => a.address));
      if (!resolved.ok) return { ok: false, reason: "blocked_address", detail: resolved.reason };
      if (controller.signal.aborted) return timedOut();

      let res: Response;
      try {
        res = await deps.fetch(check.url.href, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
          headers: {
            "User-Agent": BOT_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
            "Accept-Language": "en",
          },
        });
      } catch {
        if (controller.signal.aborted) return timedOut();
        return { ok: false, reason: "network_error", detail: "The site could not be reached." };
      }

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await cancelBody(res);
        if (hop >= maxRedirects) {
          return { ok: false, reason: "too_many_redirects", detail: "The page redirected too many times." };
        }
        try {
          current = new URL(location, check.url).href;
        } catch {
          return { ok: false, reason: "invalid_url", detail: "The page redirected to an invalid address." };
        }
        continue;
      }

      if (!res.ok) {
        await cancelBody(res);
        return { ok: false, reason: "http_error", status: res.status, detail: `The site answered with HTTP ${res.status}.` };
      }

      const contentTypeHeader = res.headers.get("content-type") ?? "";
      const contentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
      if (!contentTypes.includes(contentType)) {
        await cancelBody(res);
        return {
          ok: false,
          reason: "bad_content_type",
          detail: `The address returned ${contentType || "an unknown type"}, not a web page.`,
        };
      }

      const { bytes, truncated } = await readCapped(res, maxBytes);
      return { ok: true, finalUrl: check.url.href, status: res.status, contentType, body: decode(bytes, contentTypeHeader), truncated };
    }
  } catch {
    if (controller.signal.aborted) return timedOut();
    return { ok: false, reason: "network_error", detail: "The site could not be read." };
  } finally {
    clearTimeout(timer);
  }
}
