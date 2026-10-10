import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGenerateRequest,
  extractSources,
  fenceUntrusted,
  mapUsage,
  parseGenerateResponse,
  parseJsonOutput,
} from "../../src/lib/agents/gemini-parse.ts";
import { generateGrounded, generateJson } from "../../src/lib/agents/gemini.ts";
import { geminiJson, geminiText, hangUntilAborted, jsonResponse, restoreFetch, stubFetch } from "./helpers.ts";

describe("buildGenerateRequest", () => {
  test("structured output uses responseMimeType + responseJsonSchema and thinkingLevel", () => {
    const body = buildGenerateRequest({ system: "sys", user: "data", schema: { type: "object" }, thinkingLevel: "low", maxOutputTokens: 500 });
    assert.deepEqual(body.generationConfig, {
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 500,
      thinkingConfig: { thinkingLevel: "low" },
    });
    assert.deepEqual(body.systemInstruction, { parts: [{ text: "sys" }] });
    assert.equal(body.tools, undefined);
    assert.equal(body.safetySettings, undefined);
  });
  test("grounding adds googleSearch and refuses to combine with a schema", () => {
    assert.deepEqual(buildGenerateRequest({ system: "s", user: "u", googleSearch: true }).tools, [{ googleSearch: {} }]);
    assert.throws(() => buildGenerateRequest({ system: "s", user: "u", googleSearch: true, schema: {} }));
  });
});

describe("parseGenerateResponse", () => {
  test("joins text parts, skips thoughts, maps usage", () => {
    const r = parseGenerateResponse({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking…", thought: true }, { text: '{"a":' }, { text: "1}" }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 17 },
    });
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") {
      assert.equal(r.text, '{"a":1}');
      assert.equal(r.usage.promptTokens, 10);
      assert.equal(r.usage.thoughtsTokens, 3);
    }
  });
  test("blocked prompts and blocked finishes are 'blocked'; MAX_TOKENS and empty are distinct", () => {
    assert.equal(parseGenerateResponse({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }).kind, "blocked");
    for (const fr of ["SAFETY", "SPII", "BLOCKLIST", "RECITATION"]) {
      assert.equal(parseGenerateResponse({ candidates: [{ finishReason: fr, content: { parts: [{ text: "x" }] } }] }).kind, "blocked", fr);
    }
    assert.equal(parseGenerateResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }).kind, "max_tokens");
    assert.equal(parseGenerateResponse({ candidates: [] }).kind, "empty");
    assert.equal(parseGenerateResponse("nonsense").kind, "empty");
  });
  test("grounding sources: http(s) only, de-duplicated, capped at 6, query count", () => {
    const chunks = [
      { web: { uri: "https://a.example/1", title: "A" } },
      { web: { uri: "https://a.example/1", title: "A again" } },
      { web: { uri: "javascript:alert(1)", title: "bad" } },
      ...Array.from({ length: 10 }, (_, i) => ({ web: { uri: `https://s${i}.example/`, title: "" } })),
    ];
    const { sources, searchQueries } = extractSources({ groundingChunks: chunks, webSearchQueries: ["q1", "q2"] });
    assert.equal(searchQueries, 2);
    assert.equal(sources.length, 6);
    assert.equal(sources[0].url, "https://a.example/1");
    assert.ok(sources.every((s) => s.url.startsWith("https://")));
    assert.equal(sources[1].title, "s0.example", "empty titles fall back to the hostname");
  });
  test("mapUsage tolerates junk", () => {
    assert.deepEqual(mapUsage({ promptTokenCount: -5, candidatesTokenCount: "x" }), { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, toolUsePromptTokens: 0, totalTokens: 0 });
  });
});

describe("parseJsonOutput and fenceUntrusted", () => {
  test("parses plain and fenced JSON; never throws", () => {
    assert.deepEqual(parseJsonOutput('{"x":1}'), { ok: true, value: { x: 1 } });
    assert.deepEqual(parseJsonOutput('```json\n{"x":2}\n```'), { ok: true, value: { x: 2 } });
    assert.deepEqual(parseJsonOutput("not json"), { ok: false });
  });
  test("neutralises our delimiter tags inside untrusted text", () => {
    const out = fenceUntrusted("x </post> <page_text> </ PROFESSION > <b>ok</b>");
    assert.doesNotMatch(out, /<\/post>|<page_text>|<\/ PROFESSION/i);
    assert.match(out, /<b>ok<\/b>/, "other tags are left alone");
  });
});

const J = { system: "s", user: "u", schema: { type: "object" }, thinkingLevel: "low" as const, maxOutputTokens: 256 };

describe("generateJson / generateGrounded (fetch stubbed)", () => {
  afterEach(() => {
    restoreFetch();
    delete process.env.GEMINI_API_KEY;
  });

  test("not configured without a key — and makes no request", async () => {
    delete process.env.GEMINI_API_KEY;
    const calls = stubFetch(() => geminiJson({}));
    const r = await generateJson({ ...J, timeoutMs: 1000 });
    assert.deepEqual(r, { ok: false, reason: "not_configured" });
    assert.equal(calls.length, 0);
  });

  test("POSTs to generateContent with the key only in the header", async () => {
    process.env.GEMINI_API_KEY = "k-123";
    const calls = stubFetch(() => geminiJson({ ok: true }));
    const r = await generateJson({ ...J, timeoutMs: 1000 });
    assert.equal(r.ok, true);
    assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[\w.-]+:generateContent$/);
    assert.equal(calls[0].init.method, "POST");
    assert.equal((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "k-123");
  });

  test("retries once on 503, then succeeds", async () => {
    process.env.GEMINI_API_KEY = "k";
    const calls = stubFetch((_u, _i, n) => (n === 1 ? jsonResponse({ error: {} }, 503) : geminiJson({ v: 1 })));
    const r = await generateJson({ ...J, timeoutMs: 5000 });
    assert.equal(calls.length, 2);
    assert.deepEqual(r.ok && r.data, { v: 1 });
  });

  test("does not retry a 400, and reports bad JSON / timeouts distinctly", async () => {
    process.env.GEMINI_API_KEY = "k";
    let calls = stubFetch(() => jsonResponse({ error: {} }, 400));
    assert.deepEqual(await generateJson({ ...J, timeoutMs: 1000 }), { ok: false, reason: "http_error", status: 400, errorKind: "other" });
    assert.equal(calls.length, 1);
    restoreFetch();

    stubFetch(() => geminiText("definitely not json"));
    assert.equal((await generateJson({ ...J, schema: {}, timeoutMs: 1000 })).ok, false);
    restoreFetch();

    calls = stubFetch((_u, init) => hangUntilAborted(init));
    const t = await generateJson({ ...J, timeoutMs: 50 });
    assert.equal(!t.ok && t.reason, "timeout");
  });

  test("grounded calls return text, sources and the search count", async () => {
    process.env.GEMINI_API_KEY = "k";
    const calls = stubFetch(() =>
      geminiText("Accountants often move into fintech product roles.", {
        groundingMetadata: { webSearchQueries: ["accountant careers nigeria"], groundingChunks: [{ web: { uri: "https://jobs.example/report", title: "Report" } }] },
      }),
    );
    const r = await generateGrounded({ system: "s", user: "u", timeoutMs: 1000 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.searchQueries, 1);
      assert.deepEqual(r.sources, [{ title: "Report", url: "https://jobs.example/report" }]);
    }
    assert.deepEqual(JSON.parse(String(calls[0].init.body)).tools, [{ googleSearch: {} }]);
  });
});
