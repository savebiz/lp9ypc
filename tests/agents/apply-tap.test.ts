// Apply tap counting helpers (src/app/api/apply-tap/tap.ts) — stage 2, section A.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLY_TAP_DEDUPE_MS,
  TapDeduper,
  clientIp,
  isMissingRelation,
  parseApplyTap,
} from "../../src/app/api/apply-tap/tap.ts";

const JOB = "3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b";

describe("parseApplyTap", () => {
  test("accepts a job id and a known source", () => {
    assert.deepEqual(parseApplyTap({ jobId: JOB, source: "welcome" }), { jobId: JOB, source: "welcome" });
    assert.deepEqual(parseApplyTap({ jobId: JOB.toUpperCase(), source: "card" }), { jobId: JOB, source: "card" });
  });
  test("refuses bad ids and unknown sources", () => {
    assert.equal(parseApplyTap({ jobId: "not-a-uuid", source: "card" }), null);
    assert.equal(parseApplyTap({ jobId: JOB, source: "email" }), null);
    assert.equal(parseApplyTap({ jobId: JOB }), null);
    assert.equal(parseApplyTap({ jobId: 42, source: "card" }), null);
  });
});

describe("TapDeduper", () => {
  test("ignores a repeat tap on the same job within 10 minutes", () => {
    const d = new TapDeduper();
    assert.equal(d.shouldCount("1.2.3.4|a", 0), true);
    assert.equal(d.shouldCount("1.2.3.4|a", APPLY_TAP_DEDUPE_MS - 1), false);
    assert.equal(d.shouldCount("1.2.3.4|b", 1), true);
    assert.equal(d.shouldCount("5.6.7.8|a", 1), true);
    assert.equal(d.shouldCount("1.2.3.4|a", APPLY_TAP_DEDUPE_MS), true);
  });
  test("stays bounded under a burst of distinct taps", () => {
    const d = new TapDeduper(APPLY_TAP_DEDUPE_MS, 100);
    for (let i = 0; i < 1000; i++) d.shouldCount(`ip|${i}`, i);
    assert.ok(d.size <= 100);
  });
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  test("takes the first forwarded address, then x-real-ip, then unknown", () => {
    assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
    assert.equal(clientIp(h({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(clientIp(h({})), "unknown");
  });
});

describe("isMissingRelation", () => {
  test("recognises a migration that isn't applied yet", () => {
    assert.equal(isMissingRelation({ code: "42P01" }), true);
    assert.equal(isMissingRelation({ code: "PGRST205", message: "Could not find the table in the schema cache" }), true);
    assert.equal(isMissingRelation({ code: "23503" }), false);
    assert.equal(isMissingRelation(null), false);
  });
});
