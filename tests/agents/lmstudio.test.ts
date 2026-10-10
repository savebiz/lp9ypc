// LM Studio provider (local helper): localhost-only guard, response parsing,
// provider routing, job scraping via the local model, and the knowledge-only
// career-research marker. No network: fetch is stubbed.
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkLocalBaseUrl, lmstudioGenerateJson, parseChatCompletion, pickModel } from "../../src/lib/agents/lmstudio.ts";
import { generateJsonVia } from "../../src/lib/agents/llm.ts";
import { LOCAL_AI_UNAVAILABLE, runJobSource } from "../../src/lib/agents/job-scraper.ts";
import { KNOWLEDGE_ONLY_SOURCE, KNOWLEDGE_ONLY_SUMMARY_PREFIX, isKnowledgeOnly, researchRow } from "../../src/lib/agents/career-research.ts";
import type { SafeFetchDeps } from "../../src/lib/agents/safe-fetch.ts";
import { jsonResponse, restoreFetch, stubFetch } from "./helpers.ts";

const J = { system: "sys", user: "data", schema: { type: "object" }, thinkingLevel: "low" as const, maxOutputTokens: 300, timeoutMs: 2000 };
const chat = (content: string, finish = "stop") =>
  jsonResponse({ choices: [{ message: { role: "assistant", content }, finish_reason: finish }], usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 } });

afterEach(() => {
  restoreFetch();
  delete process.env.LMSTUDIO_BASE_URL;
  delete process.env.LMSTUDIO_MODEL;
  delete process.env.GEMINI_API_KEY;
});

describe("checkLocalBaseUrl (localhost-only guard)", () => {
  test("accepts this computer only", () => {
    for (const ok of [undefined, "", "http://localhost:1234/v1", "http://127.0.0.1:1234/v1/", "http://[::1]:1234/v1", "https://LOCALHOST:8443/v1"]) {
      assert.equal(checkLocalBaseUrl(ok).ok, true, String(ok));
    }
    assert.deepEqual(checkLocalBaseUrl(undefined), { ok: true, baseUrl: "http://localhost:1234/v1" });
  });
  test("refuses remote, LAN, look-alike, credentialed and non-http URLs", () => {
    for (const bad of [
      "https://api.example.com/v1",
      "http://192.168.1.20:1234/v1",
      "http://10.0.0.5:1234/v1",
      "http://localhost.evil.example/v1",
      "http://127.0.0.1.nip.io:1234/v1",
      "http://user:pw@localhost:1234/v1",
      "file:///C:/x",
      "http://0.0.0.0:1234/v1",
      "not a url",
    ]) {
      assert.equal(checkLocalBaseUrl(bad).ok, false, bad);
    }
  });
  test("a remote LMSTUDIO_BASE_URL makes no request at all", async () => {
    process.env.LMSTUDIO_BASE_URL = "https://api.example.com/v1";
    process.env.LMSTUDIO_MODEL = "m";
    const calls = stubFetch(() => chat("{}"));
    const r = await lmstudioGenerateJson(J);
    assert.deepEqual(r, { ok: false, reason: "not_configured" });
    assert.equal(calls.length, 0);
  });
});

describe("LM Studio client", () => {
  test("parseChatCompletion: JSON content, <think> stripped, length and empty answers", () => {
    const ok = parseChatCompletion({ choices: [{ message: { content: '<think>hmm</think>{"a":1}' }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.data, { a: 1 });
      assert.equal(ok.usage.promptTokens, 7);
      assert.equal(ok.usage.totalTokens, 10);
    }
    assert.equal((parseChatCompletion({ choices: [{ message: { content: '{"a":' }, finish_reason: "length" }] }) as { reason: string }).reason, "max_tokens");
    assert.equal((parseChatCompletion({ choices: [{ message: { content: "" } }] }) as { reason: string }).reason, "bad_json");
    assert.equal((parseChatCompletion({ choices: [{ message: { content: "not json" } }] }) as { reason: string }).reason, "bad_json");
    assert.equal((parseChatCompletion("junk") as { reason: string }).reason, "bad_json");
  });

  test("pickModel prefers LMSTUDIO_MODEL, then Gemma 4 E4B, then Qwen3.8 27B, then the first model", () => {
    assert.equal(pickModel("my-model", ["a"]), "my-model");
    assert.equal(pickModel(null, ["qwen3.8-27b", "gemma-4-e4b-it"]), "gemma-4-e4b-it");
    assert.equal(pickModel(null, ["other", "qwen3.8-27b"]), "qwen3.8-27b");
    assert.equal(pickModel(null, []), null);
  });

  test("POSTs a strict json_schema request to the local server, no API key, no redirects", async () => {
    process.env.LMSTUDIO_MODEL = "qwen3.8-27b";
    const calls = stubFetch(() => chat('{"jobs":[]}'));
    const r = await lmstudioGenerateJson({ ...J, schema: { type: "object", properties: {} } });
    assert.equal(r.ok, true);
    assert.equal(calls[0].url, "http://localhost:1234/v1/chat/completions");
    assert.equal(calls[0].init.redirect, "error");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(Object.keys(headers).some((h) => /authorization|api-key/i.test(h)), false);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, "qwen3.8-27b");
    assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "result", schema: { type: "object", properties: {} }, strict: true } });
    assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ["system", "user"]);
    assert.equal(body.max_tokens, 300);
  });

  test("without LMSTUDIO_MODEL it asks GET /v1/models and uses the preferred model", async () => {
    const calls = stubFetch((url) =>
      url.endsWith("/models") ? jsonResponse({ data: [{ id: "qwen3.8-27b-instruct" }, { id: "google/gemma-4-e4b" }] }) : chat("{}"),
    );
    await lmstudioGenerateJson(J);
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(String(calls[1].init.body)).model, "google/gemma-4-e4b");
  });

  test("server down → http_error (not a crash); routed through generateJsonVia('lmstudio')", async () => {
    process.env.LMSTUDIO_MODEL = "m";
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const r = await generateJsonVia("lmstudio", J);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "http_error");
  });
});

// ── Job scraper with the local model ──

function fakeAdmin() {
  const ops: { table: string; action: string | null; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      const op = { table, action: null as string | null, payload: null as unknown };
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        update: (p: unknown) => ((op.action = "update"), (op.payload = p), b),
        insert: (p: unknown) => ((op.action = "insert"), (op.payload = p), b),
        select: () => ((op.action ??= "select"), b),
        eq: () => b,
        in: () => b,
        then: (res: (v: unknown) => unknown) => {
          ops.push(op);
          return Promise.resolve({ data: op.table === "jobs" && op.action === "select" ? [] : null, error: null }).then(res);
        },
      });
      return b;
    },
  };
  return { ops, admin: client as unknown as SupabaseClient };
}

const PAGE = "https://jobs.example.ng/latest";
const PAGE_HTML = `<html><body><main><h1>Latest jobs</h1><p>Accountant at Acme Ltd, Lagos. <a href="/job/acme-accountant">Apply</a></p>${"<p>More details about the role.</p>".repeat(20)}</main></body></html>`;
const deps: SafeFetchDeps = {
  lookup: async () => [{ address: "93.184.216.34" }],
  fetch: async (url) =>
    url === PAGE
      ? new Response(PAGE_HTML, { status: 200, headers: { "content-type": "text/html" } })
      : new Response("nope", { status: 404, headers: { "content-type": "text/plain" } }),
};
const CATALOGUE = [{ id: "p-fin", slug: "finance-accounting", name: "Finance & Accounting" }];
const source = { id: "s-9", name: "Example", url: PAGE };
const JOB = {
  title: "Accountant", company: "Acme Ltd", location: "Lagos", work_mode: "unknown", engagement_type: "unknown", experience_level: "unknown",
  deadline: null, description: null, application_link: "https://jobs.example.ng/job/acme-accountant", salary_range: null, career_path_slug: "finance-accounting",
};

describe("runJobSource with provider 'lmstudio'", () => {
  test("pages without structured data are read by the local model (no Gemini key needed)", async () => {
    process.env.LMSTUDIO_MODEL = "qwen3.8-27b";
    const calls = stubFetch(() => chat(JSON.stringify({ jobs: [JOB] })));
    const { ops, admin } = fakeAdmin();
    const r = await runJobSource(admin, source, { provider: "lmstudio", catalogue: CATALOGUE, fetchDeps: deps, deadline: Date.now() + 600_000 });
    assert.equal(r.status, "ok");
    assert.equal(r.inserted, 1);
    assert.equal(r.details.ai_provider, "lmstudio");
    assert.ok(calls.every((c) => c.url.startsWith("http://localhost:1234/")), "only the local server is called");
    const row = (ops.find((o) => o.table === "jobs" && o.action === "insert")!.payload as Record<string, unknown>[])[0];
    assert.equal(row.review_status, "pending");
    assert.equal(row.career_path_id, "p-fin");
  });

  test("LM Studio not running → plain local-AI sentence in last_error", async () => {
    process.env.LMSTUDIO_MODEL = "m";
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const { ops, admin } = fakeAdmin();
    const r = await runJobSource(admin, source, { provider: "lmstudio", catalogue: CATALOGUE, fetchDeps: deps, deadline: Date.now() + 600_000 });
    assert.equal(r.message, LOCAL_AI_UNAVAILABLE);
    const last = ops.filter((o) => o.table === "job_sources").at(-1)!.payload as { last_error: string };
    assert.equal(last.last_error, LOCAL_AI_UNAVAILABLE);
  });

  test("--dry-run writes nothing at all", async () => {
    process.env.LMSTUDIO_MODEL = "m";
    stubFetch(() => chat(JSON.stringify({ jobs: [JOB] })));
    const { ops, admin } = fakeAdmin();
    const r = await runJobSource(admin, source, { provider: "lmstudio", dryRun: true, catalogue: CATALOGUE, fetchDeps: deps, deadline: Date.now() + 600_000 });
    assert.equal(r.found, 1);
    assert.equal(r.inserted, 0);
    assert.equal(ops.some((o) => o.action === "update" || o.action === "insert"), false);
  });
});

describe("knowledge-only career research marker", () => {
  const mapping = {
    matches: [{ slug: "finance-accounting", reason: "Core skills." }],
    switch_options: [],
    emerging_paths: [],
    summary: "Accountants in Lagos often grow into finance leadership.",
  };
  test("local results carry the marker source and the summary prefix; web results don't", () => {
    const local = researchRow({ key: "accountant", label: "Accountant" }, mapping, [], true);
    assert.deepEqual(local.sources, [KNOWLEDGE_ONLY_SOURCE]);
    assert.equal(local.summary, `${KNOWLEDGE_ONLY_SUMMARY_PREFIX}${mapping.summary}`);
    assert.equal(isKnowledgeOnly(local.sources as { title: string; url: string }[]), true);
    assert.equal(KNOWLEDGE_ONLY_SOURCE.url, "", "never a clickable link");

    const web = researchRow({ key: "accountant", label: "Accountant" }, mapping, [{ title: "ICAN", url: "https://ican.example/" }], false);
    assert.equal(web.summary, mapping.summary);
    assert.equal(isKnowledgeOnly(web.sources as { title: string; url: string }[]), false);
    assert.equal(isKnowledgeOnly(null), false);
  });
});
