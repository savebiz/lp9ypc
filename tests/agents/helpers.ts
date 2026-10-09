// Shared test helpers (not a test file). No network: fetch is always stubbed.

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;

/** Replaces global fetch with `handler`; returns the list of calls made. */
export function stubFetch(handler: (url: string, init: RequestInit, n: number) => Promise<Response> | Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {}, calls.length);
  }) as typeof fetch;
  return calls;
}

export function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

/** A fetch stub that never answers until its signal aborts (simulates a hung server). */
export function hangUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init.signal;
    if (!signal) return;
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A generateContent response whose answer is `text`. */
export function geminiText(text: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", ...extra }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 125 },
  });
}

export function geminiJson(value: unknown): Response {
  return geminiText(JSON.stringify(value));
}
