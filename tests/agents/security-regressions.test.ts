// Regression tests for the Phase 2 security review (M1, M3, L6).
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../../src/lib/utils.ts";
import { moderatePost } from "../../src/lib/agents/moderation.ts";
import { extractPage } from "../../src/lib/agents/html-extract.ts";
import { geminiText, jsonResponse, restoreFetch, stubFetch } from "./helpers.ts";

describe("safeNextPath (M3: no open redirect after sign-in)", () => {
  test("keeps same-site paths", () => {
    assert.equal(safeNextPath("/dashboard"), "/dashboard");
    assert.equal(safeNextPath("/community/ypc-lounge?x=1#top"), "/community/ypc-lounge?x=1#top");
  });
  test("rejects anything that could leave the site", () => {
    for (const evil of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/%09/evil.example".replace("%09", "\t"),
      "https://evil.example",
      "javascript:alert(1)",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      assert.equal(safeNextPath(evil as string | null | undefined), "/dashboard", JSON.stringify(evil));
    }
  });
});

describe("moderation (M1: content-dependent failures are held, not published)", () => {
  afterEach(() => {
    restoreFetch();
    delete process.env.GEMINI_API_KEY;
  });
  const post = { kind: "reply" as const, body: "Ordinary looking text", communityName: "YPC Lounge" };

  test("an over-long (MAX_TOKENS) answer holds the post", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => jsonResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }));
    const r = await moderatePost(post);
    assert.equal(r.decision, "hold");
    assert.equal(r.source, "agent");
  });

  test("an unreadable or off-schema answer holds the post", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => geminiText("I refuse to answer in JSON"));
    assert.equal((await moderatePost(post)).decision, "hold");
    restoreFetch();
    stubFetch(() => geminiText(JSON.stringify({ decision: "publish-it" })));
    assert.equal((await moderatePost(post)).decision, "hold");
  });

  test("an outage still fails open (published, flagged for review)", async () => {
    process.env.GEMINI_API_KEY = "k";
    stubFetch(() => jsonResponse({}, 500));
    const r = await moderatePost(post);
    assert.equal(r.source, "unavailable");
  });
});

describe("html-extract (L6: hostile pages can't stall the scraper)", () => {
  test("thousands of unclosed <a> tags are processed quickly", () => {
    const hostile = `<html><body>${'<a href="/x">'.repeat(40_000)}text</body></html>`;
    const started = Date.now();
    const page = extractPage(hostile, "https://jobs.example/");
    const ms = Date.now() - started;
    assert.ok(ms < 2_000, `took ${ms} ms`);
    assert.ok(page.links.includes("https://jobs.example/x"));
  });
});
