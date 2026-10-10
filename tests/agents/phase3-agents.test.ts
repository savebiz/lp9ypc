// Phase 3: Gemini resilience, background post moderation, and the job
// scraper's structured-first flow. No network: Gemini fetch is stubbed, page
// fetches and DNS go through injected deps, and Supabase is a small fake.
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyGeminiError } from "../../src/lib/agents/gemini-parse.ts";
import { generateJson, isBusyFailure, isQuotaFailure } from "../../src/lib/agents/gemini.ts";
import { runPostModeration } from "../../src/lib/agents/post-moderation-run.ts";
import { JOB_SOURCE_MESSAGES, aiFailureMessage, runJobSource } from "../../src/lib/agents/job-scraper.ts";
import type { SafeFetchDeps } from "../../src/lib/agents/safe-fetch.ts";
import { geminiJson, jsonResponse, restoreFetch, stubFetch } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

const QUOTA_BODY = JSON.stringify({
  error: {
    code: 429,
    message: "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generate_content_paid_tier_input_token_count, limit: 0",
    status: "RESOURCE_EXHAUSTED",
  },
});
const PER_MINUTE_BODY = JSON.stringify({
  error: {
    code: 429,
    message: "Resource has been exhausted.",
    status: "RESOURCE_EXHAUSTED",
    details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] }],
  },
});
const OVERLOADED_BODY = JSON.stringify({ error: { code: 503, message: "The model is overloaded. Please try again later.", status: "UNAVAILABLE" } });

const raw = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "application/json" } });
const J = { system: "s", user: "u", schema: { type: "object" }, thinkingLevel: "low" as const, maxOutputTokens: 256 };

afterEach(() => {
  restoreFetch();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_FALLBACK_MODEL;
});

describe("classifyGeminiError", () => {
  test("billing / limit 0 / daily caps are 'quota'; per-minute is 'rate_limit'; 503 is 'overloaded'", () => {
    assert.equal(classifyGeminiError(429, QUOTA_BODY).kind, "quota");
    assert.equal(classifyGeminiError(429, '{"error":{"message":"GenerateRequestsPerDayPerProjectPerModel"}}').kind, "quota");
    assert.equal(classifyGeminiError(429, PER_MINUTE_BODY).kind, "rate_limit");
    assert.equal(classifyGeminiError(429, "").kind, "rate_limit");
    assert.equal(classifyGeminiError(503, OVERLOADED_BODY).kind, "overloaded");
    assert.equal(classifyGeminiError(500, '{"error":{"message":"The model is overloaded"}}').kind, "overloaded");
    assert.equal(classifyGeminiError(500, "{}").kind, "server");
    assert.equal(classifyGeminiError(400, "{}").kind, "other");
    assert.equal(classifyGeminiError(429, '{"details":[{"retryDelay":"2.5s"}]}').retryDelayMs, 2500);
  });
});

describe("Gemini retries and fallback", () => {
  test("a 'check your plan and billing' 429 is not retried and is reported as quota", async () => {
    process.env.GEMINI_API_KEY = "secret-key-1";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-fallback-test";
    const calls = stubFetch(() => raw(QUOTA_BODY, 429));
    const r = await generateJson({ ...J, timeoutMs: 5000 });
    assert.equal(calls.length, 1, "no retry, no fallback");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 429);
      assert.equal(r.errorKind, "quota");
      assert.equal(isQuotaFailure(r), true);
      assert.equal(aiFailureMessage(r), JOB_SOURCE_MESSAGES.aiQuota);
    }
  });

  test("503 → fallback model once → success; the key never appears in a URL", async () => {
    process.env.GEMINI_API_KEY = "secret-key-2";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-fallback-test";
    const calls = stubFetch((_u, _i, n) => (n === 1 ? raw(OVERLOADED_BODY, 503) : geminiJson({ v: 2 })));
    const r = await generateJson({ ...J, timeoutMs: 5000 });
    assert.deepEqual(r.ok && r.data, { v: 2 });
    assert.equal(calls.length, 2);
    assert.doesNotMatch(calls[0].url, /gemini-fallback-test/);
    assert.match(calls[1].url, /\/models\/gemini-fallback-test:generateContent$/);
    assert.ok(calls.every((c) => !c.url.includes("secret-key-2")));
  });

  test("per-minute 429 is retried (fallback first, then backoff on the primary)", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-fallback-test";
    const calls = stubFetch((_u, _i, n) => (n <= 2 ? raw(PER_MINUTE_BODY, 429) : geminiJson({ v: 3 })));
    const r = await generateJson({ ...J, timeoutMs: 8000 });
    assert.deepEqual(r.ok && r.data, { v: 3 });
    assert.equal(calls.length, 3);
    assert.match(calls[1].url, /gemini-fallback-test/);
    assert.doesNotMatch(calls[2].url, /gemini-fallback-test/, "the fallback is only tried once");
  });

  test("keeps retrying only while the budget allows, then reports a busy 503", async () => {
    process.env.GEMINI_API_KEY = "k";
    const calls = stubFetch(() => raw(OVERLOADED_BODY, 503));
    const started = Date.now();
    const r = await generateJson({ ...J, timeoutMs: 3000 });
    assert.ok(Date.now() - started < 3000, "never overruns the caller's budget");
    assert.equal(calls.length, 1, "no time left for a useful retry inside 3 s after backoff");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 503);
      assert.equal(r.errorKind, "overloaded");
      assert.equal(isBusyFailure(r), true);
      assert.equal(aiFailureMessage(r), JOB_SOURCE_MESSAGES.aiBusy);
    }
  });

  test("aiFailureMessage covers timeouts and missing keys", () => {
    assert.equal(aiFailureMessage({ ok: false, reason: "timeout" }), JOB_SOURCE_MESSAGES.aiBusy);
    assert.equal(aiFailureMessage({ ok: false, reason: "not_configured" }), JOB_SOURCE_MESSAGES.aiNotConfigured);
  });
});

// ── A tiny fake Supabase client: records every query, answers via a handler. ──

interface Op {
  table: string;
  action: "select" | "update" | "insert" | null;
  payload: unknown;
  filters: [string, string, unknown][];
}

function fakeAdmin(handler: (op: Op) => { data?: unknown; error?: { code?: string } | null }) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, action: null, payload: null, filters: [] };
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        update: (p: unknown) => ((op.action = "update"), (op.payload = p), b),
        insert: (p: unknown) => ((op.action = "insert"), (op.payload = p), b),
        select: () => ((op.action ??= "select"), b),
        eq: (k: string, v: unknown) => (op.filters.push(["eq", k, v]), b),
        in: (k: string, v: unknown) => (op.filters.push(["in", k, v]), b),
        order: () => b,
        limit: () => b,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          ops.push(op);
          const out = handler(op);
          return Promise.resolve({ data: out.data ?? null, error: out.error ?? null }).then(res, rej);
        },
      });
      return b;
    },
  };
  return { ops, admin: client as unknown as SupabaseClient };
}

describe("runPostModeration (background check)", () => {
  const job = { kind: "thread" as const, id: "t-1", communityId: "c-1", communityName: "Tech", title: "Hello", body: "Any tips for a first PM job?" };

  test("allow → visible, only while still pending, logged; moderation asks for 1024 output tokens", async () => {
    process.env.GEMINI_API_KEY = "k";
    const calls = stubFetch(() => geminiJson({ decision: "allow", categories: [], reason: "" }));
    const { ops, admin } = fakeAdmin((op) => (op.action === "update" ? { data: [{ id: "t-1" }] } : {}));
    const status = await runPostModeration(admin, job);
    assert.equal(status, "visible");
    assert.equal(JSON.parse(String(calls[0].init.body)).generationConfig.maxOutputTokens, 1024);
    const update = ops.find((o) => o.action === "update")!;
    assert.equal(update.table, "threads");
    assert.deepEqual(update.filters, [["eq", "id", "t-1"], ["eq", "status", "pending"]]);
    assert.equal((update.payload as { status: string }).status, "visible");
    const log = ops.find((o) => o.table === "moderation_log")!;
    assert.equal((log.payload as { action: string }).action, "allow");
  });

  test("hold → held with reason and categories", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => geminiJson({ decision: "hold", categories: ["scam"], reason: "Pay-to-apply job." }));
    const { ops, admin } = fakeAdmin((op) => (op.action === "update" ? { data: [{ id: "r-1" }] } : {}));
    const status = await runPostModeration(admin, { ...job, kind: "reply", id: "r-1", title: undefined });
    assert.equal(status, "held");
    const update = ops.find((o) => o.action === "update")!;
    assert.equal(update.table, "replies");
    assert.deepEqual(update.payload, {
      status: "held", needs_review: false, moderation_reason: "Pay-to-apply job.", moderation_categories: ["scam"], moderated_by: "agent",
    });
  });

  test("AI unavailable (quota) → visible + needs_review, logged as a system flag", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => raw(QUOTA_BODY, 429));
    const { ops, admin } = fakeAdmin((op) => (op.action === "update" ? { data: [{ id: "t-1" }] } : {}));
    const status = await runPostModeration(admin, job);
    assert.equal(status, "visible");
    assert.equal((ops.find((o) => o.action === "update")!.payload as { needs_review: boolean }).needs_review, true);
    const log = ops.find((o) => o.table === "moderation_log")!.payload as { action: string; actor_type: string; reason: string };
    assert.equal(log.action, "flag");
    assert.equal(log.actor_type, "system");
    assert.match(log.reason, /quota/i);
  });

  test("a manager acted first (row no longer pending) → nothing applied, nothing logged", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => geminiJson({ decision: "allow", categories: [], reason: "" }));
    const { ops, admin } = fakeAdmin((op) => (op.action === "update" ? { data: [] } : {}));
    assert.equal(await runPostModeration(admin, job), "pending");
    assert.equal(ops.some((o) => o.table === "moderation_log"), false);
  });

  test("never throws, even if the database client explodes", async () => {
    const admin = { from() { throw new Error("boom"); } } as unknown as SupabaseClient;
    assert.equal(await runPostModeration(admin, job), "pending");
  });
});

// ── Job scraper: structured first, AI only as a fallback. ──

const CATALOGUE = [
  { id: "p-tech", slug: "tech-product", name: "Tech & Product" },
  { id: "p-fin", slug: "finance-accounting", name: "Finance & Accounting" },
  { id: "p-hr", slug: "human-resources", name: "Human Resources" },
  { id: "p-media", slug: "media-communications", name: "Media & Communications" },
];

function pageDeps(routes: Record<string, () => Response>): SafeFetchDeps {
  return {
    lookup: async () => [{ address: "93.184.216.34" }],
    fetch: async (url) => {
      const route = routes[url];
      return route ? route() : new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    },
  };
}

function scraperAdmin() {
  return fakeAdmin((op) => {
    if (op.table === "jobs" && op.action === "select") return { data: [] };
    return {};
  });
}

const html = (body: string) => () => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const lastSourceUpdate = (ops: Op[]) => ops.filter((o) => o.table === "job_sources" && o.action === "update").at(-1)!.payload as Record<string, unknown>;

describe("runJobSource", () => {
  const source = { id: "s-1", name: "Example careers", url: "https://careers.example.ng/jobs/" };
  const opts = (deps: SafeFetchDeps) => ({ catalogue: CATALOGUE, fetchDeps: deps, deadline: Date.now() + 55_000 });

  test("JSON-LD page: jobs inserted as pending without calling Gemini (no key needed)", async () => {
    const gemini = stubFetch(() => geminiJson({ jobs: [] }));
    const { ops, admin } = scraperAdmin();
    const r = await runJobSource(admin, source, opts(pageDeps({ [source.url]: html(fixture("jsonld-graph.html")) })));
    assert.equal(r.status, "ok");
    assert.equal(r.found, 2);
    assert.equal(r.inserted, 2);
    assert.equal(r.details.method, "structured");
    assert.equal(gemini.length, 0, "no AI call");
    const insert = ops.find((o) => o.table === "jobs" && o.action === "insert")!.payload as Record<string, unknown>[];
    assert.ok(insert.every((row) => row.review_status === "pending" && row.source_id === "s-1"));
    assert.equal(insert.find((row) => row.title === "Senior Software Engineer")!.career_path_id, "p-tech");
    assert.deepEqual(
      { status: lastSourceUpdate(ops).last_status, error: lastSourceUpdate(ops).last_error },
      { status: "ok", error: null },
    );
  });

  test("RSS feed served as application/rss+xml is read as structured data", async () => {
    const feedUrl = "https://jobs.example.org/feed/";
    const { admin } = scraperAdmin();
    const r = await runJobSource(
      admin,
      { ...source, url: feedUrl },
      opts(pageDeps({ [feedUrl]: () => new Response(fixture("jobs.rss"), { status: 200, headers: { "content-type": "application/rss+xml" } }) })),
    );
    assert.equal(r.status, "ok");
    assert.equal(r.details.structured_format, "rss");
    assert.equal(r.inserted, 2);
  });

  test("robots.txt disallow → 'blocked' with the exact sentence", async () => {
    const { ops, admin } = scraperAdmin();
    const r = await runJobSource(
      admin,
      source,
      opts(pageDeps({ "https://careers.example.ng/robots.txt": () => new Response("User-agent: *\nDisallow: /jobs/", { status: 200, headers: { "content-type": "text/plain" } }) })),
    );
    assert.equal(r.status, "blocked");
    assert.equal(lastSourceUpdate(ops).last_error, "Blocked by the site's robots.txt, so we can't read it.");
    assert.equal(lastSourceUpdate(ops).last_status, "blocked");
  });

  test("page can't be opened → the exact fetch sentence", async () => {
    const { ops, admin } = scraperAdmin();
    const r = await runJobSource(admin, source, opts(pageDeps({ [source.url]: () => new Response("down", { status: 502, headers: { "content-type": "text/html" } }) })));
    assert.equal(r.status, "error");
    assert.equal(lastSourceUpdate(ops).last_error, "Couldn't open the page (it may be down or blocking us).");
  });

  test("no structured data + Gemini quota 429 → billing sentence; AI input is trimmed to ~12k chars of main content", async () => {
    process.env.GEMINI_API_KEY = "k";
    const calls = stubFetch(() => raw(QUOTA_BODY, 429));
    const big = `<html><body><nav>${"NAV ".repeat(5000)}</nav><main><h1>Vacancies</h1><p>${"Accountant wanted in Lagos. ".repeat(3000)}</p></main></body></html>`;
    const { ops, admin } = scraperAdmin();
    const r = await runJobSource(admin, source, opts(pageDeps({ [source.url]: html(big) })));
    assert.equal(r.status, "error");
    assert.equal(r.message, "Gemini needs billing turned on for this key (quota exceeded).");
    assert.equal(lastSourceUpdate(ops).last_error, r.message);
    assert.equal(calls.length, 1, "quota errors don't burn retries");
    const userText = JSON.parse(String(calls[0].init.body)).contents[0].parts[0].text as string;
    assert.ok(userText.length < 12_500, `AI input was ${userText.length} chars`);
    assert.doesNotMatch(userText, /NAV NAV/);
  });

  test("no structured data and AI finds nothing → 'No job listings found on this page.'", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => geminiJson({ jobs: [] }));
    const { ops, admin } = scraperAdmin();
    const r = await runJobSource(admin, source, opts(pageDeps({ [source.url]: html("<main><p>We are not hiring right now.</p></main>") })));
    assert.equal(r.status, "empty");
    assert.equal(lastSourceUpdate(ops).last_error, "No job listings found on this page.");
    assert.equal(lastSourceUpdate(ops).last_status, "empty");
  });
});
