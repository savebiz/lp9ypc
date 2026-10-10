import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SafeFetchDeps, SafeFetchResult } from "../../src/lib/agents/safe-fetch.ts";
import { safeFetchText } from "../../src/lib/agents/safe-fetch.ts";
import {
  buildFeedbackRows,
  checkJobs,
  checkLink,
  classifyFetch,
  countsAsFailure,
  DEADLINE_PASSED_MESSAGE,
  deadlinePassed,
  EVENT_PASSED_MESSAGE,
  eventPassed,
  nextHealth,
  selectDueJobs,
  type CheckableJob,
  type LinkCheckResult,
} from "../../src/lib/agents/link-check.ts";

const NOW = Date.parse("2026-10-12T05:00:00Z"); // 06:00 in Lagos
const HOUR = 60 * 60 * 1000;

const httpErr = (status: number): SafeFetchResult => ({ ok: false, reason: "http_error", status, detail: "" });
const okAt = (finalUrl: string, status = 200): SafeFetchResult => ({ ok: true, finalUrl, status, contentType: "text/html", body: "", truncated: false });

/** Fake DNS + fetch keyed by "METHOD url"; records every call. No network. */
/** A resolver error shaped like Node's (err.code). */
const dnsErr = (code: string) => Object.assign(new Error(`getaddrinfo ${code}`), { code });

function deps(routes: Record<string, () => Response>): SafeFetchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    lookup: async (host) => {
      if (host.endsWith(".example")) return [{ address: "93.184.216.34" }];
      if (host === "intranet.test") return [{ address: "10.0.0.5" }];
      if (host === "flaky-dns.test") throw dnsErr("EAI_AGAIN");
      throw dnsErr("ENOTFOUND");
    },
    fetch: async (url, init) => {
      const key = `${init.method ?? "GET"} ${url}`;
      calls.push(key);
      const r = routes[key];
      return r ? r() : new Response(null, { status: 404 });
    },
  };
}
const status = (s: number, headers: Record<string, string> = {}) => () => new Response(null, { status: s, headers });

describe("classifyFetch", () => {
  test("2xx on a real page is ok", () => {
    assert.deepEqual(classifyFetch("https://jobs.example/apply/1", okAt("https://jobs.example/apply/1")), { status: "ok", http: 200 });
  });
  test("404 and 410 are not_found", () => {
    assert.equal(classifyFetch("https://jobs.example/a", httpErr(404)).status, "not_found");
    assert.equal(classifyFetch("https://jobs.example/a", httpErr(410)).status, "not_found");
  });
  test("ending on the site root when the link had a path is redirect_home", () => {
    assert.equal(classifyFetch("https://jobs.example/apply/1", okAt("https://jobs.example/")).status, "redirect_home");
    assert.equal(classifyFetch("https://jobs.example/apply?id=1", okAt("https://www.jobs.example/")).status, "redirect_home");
  });
  test("a root link that stays on the root is ok", () => {
    assert.equal(classifyFetch("https://jobs.example/", okAt("https://jobs.example/")).status, "ok");
    assert.equal(classifyFetch("https://jobs.example/apply/1", okAt("https://jobs.example/?ref=x")).status, "ok");
  });
  test("403/429 are blocked, 5xx error, timeouts and network failures are not failures", () => {
    assert.equal(classifyFetch("https://x.example/a", httpErr(403)).status, "blocked");
    assert.equal(classifyFetch("https://x.example/a", httpErr(429)).status, "blocked");
    assert.equal(classifyFetch("https://x.example/a", httpErr(500)).status, "error");
    assert.equal(classifyFetch("https://x.example/a", httpErr(503)).status, "error");
    assert.equal(classifyFetch("https://x.example/a", { ok: false, reason: "timeout", detail: "" }).status, "timeout");
    assert.equal(classifyFetch("https://x.example/a", { ok: false, reason: "network_error", detail: "" }).status, "error");
    assert.equal(classifyFetch("https://x.example/a", { ok: false, reason: "dns_error", detail: "" }).status, "error");
    assert.equal(classifyFetch("https://x.example/a", httpErr(401)).status, "blocked");
    assert.equal(classifyFetch("https://x.example/a", { ok: false, reason: "too_many_redirects", detail: "" }).status, "error");
    assert.equal(classifyFetch("https://x.example/a", { ok: false, reason: "blocked_address", detail: "" }).status, "blocked");
    for (const s of ["blocked", "error", "timeout", "ok"] as const) assert.equal(countsAsFailure(s), false);
    assert.equal(countsAsFailure("not_found"), true);
    assert.equal(countsAsFailure("redirect_home"), true);
    assert.equal(countsAsFailure("domain_gone"), true);
  });
  test("DNS: ENOTFOUND is domain_gone (counts); EAI_AGAIN and unknown codes are error (don't count)", () => {
    const dns = (dnsCode?: string): SafeFetchResult => ({ ok: false, reason: "dns_error", detail: "", ...(dnsCode ? { dnsCode } : {}) });
    assert.equal(classifyFetch("https://x.example/a", dns("ENOTFOUND")).status, "domain_gone");
    assert.equal(classifyFetch("https://x.example/a", dns("EAI_AGAIN")).status, "error");
    assert.equal(classifyFetch("https://x.example/a", dns()).status, "error");
  });
});

describe("checkLink (injected fetch, no network)", () => {
  test("uses HEAD with the bot user agent and stops on success", async () => {
    let ua = "";
    const d = deps({ "HEAD https://jobs.example/apply/1": status(200) });
    const inner = d.fetch;
    d.fetch = async (url, init) => {
      ua = String((init.headers as Record<string, string>)["User-Agent"]);
      return inner(url, init);
    };
    assert.deepEqual(await checkLink("https://jobs.example/apply/1", { fetchDeps: d }), { status: "ok", http: 200 });
    assert.deepEqual(d.calls, ["HEAD https://jobs.example/apply/1"]);
    assert.match(ua, /LP9YPC-JobBot/);
  });

  test("falls back to GET when HEAD is refused", async () => {
    const d = deps({
      "HEAD https://jobs.example/apply/2": status(405),
      "GET https://jobs.example/apply/2": () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    assert.deepEqual(await checkLink("https://jobs.example/apply/2", { fetchDeps: d }), { status: "ok", http: 200 });
    assert.deepEqual(d.calls, ["HEAD https://jobs.example/apply/2", "GET https://jobs.example/apply/2"]);
  });

  test("404 on both HEAD and GET is not_found", async () => {
    const d = deps({});
    assert.deepEqual(await checkLink("https://jobs.example/gone", { fetchDeps: d }), { status: "not_found", http: 404 });
  });

  test("follows redirects and detects a redirect to the home page", async () => {
    const d = deps({
      "HEAD https://jobs.example/apply/3": status(301, { location: "/" }),
      "HEAD https://jobs.example/": status(200),
    });
    assert.equal((await checkLink("https://jobs.example/apply/3", { fetchDeps: d })).status, "redirect_home");
  });

  test("a domain that no longer exists (ENOTFOUND) is domain_gone; a temporary DNS failure (EAI_AGAIN) is not", async () => {
    const gone = deps({});
    assert.deepEqual(await checkLink("https://vanished.test/apply", { fetchDeps: gone }), { status: "domain_gone", http: null });
    assert.equal(gone.calls.length, 0);
    const flaky = deps({});
    assert.deepEqual(await checkLink("https://flaky-dns.test/apply", { fetchDeps: flaky }), { status: "error", http: null });
  });

  test("never connects to a private address (SSRF guard still applies)", async () => {
    const d = deps({});
    const r = await checkLink("https://intranet.test/apply", { fetchDeps: d });
    assert.equal(r.status, "blocked");
    assert.equal(d.calls.length, 0);
  });

  test("plain GET page fetches are unchanged", async () => {
    const d = deps({ "GET https://jobs.example/page": () => new Response("<p>x</p>", { status: 200, headers: { "content-type": "text/html" } }) });
    const r = await safeFetchText("https://jobs.example/page", {}, d);
    assert.equal(r.ok && r.body, "<p>x</p>");
  });
});

describe("two-strike rule", () => {
  const nf: LinkCheckResult = { status: "not_found", http: 404 };
  test("first not_found counts 1 and doesn't flag; the second flags", () => {
    const first = nextHealth("j1", null, nf, NOW);
    assert.equal(first.row.fail_count, 1);
    assert.equal(first.flag, false);
    const second = nextHealth("j1", first.row, nf, NOW + 24 * HOUR);
    assert.equal(second.row.fail_count, 2);
    assert.equal(second.flag, true);
    assert.equal(second.row.last_status, "not_found");
    assert.equal(second.row.last_http, 404);
  });
  test("403, 5xx and timeouts are recorded but neither count nor reset", () => {
    for (const r of [{ status: "blocked", http: 403 }, { status: "error", http: 500 }, { status: "timeout", http: null }] as LinkCheckResult[]) {
      const h = nextHealth("j1", { fail_count: 1 }, r, NOW);
      assert.equal(h.row.fail_count, 1);
      assert.equal(h.flag, false);
      assert.equal(h.row.last_status, r.status);
    }
  });
  test("domain_gone goes through the same two strikes; EAI_AGAIN-style errors don't", () => {
    const gone: LinkCheckResult = { status: "domain_gone", http: null };
    const first = nextHealth("j2", null, gone, NOW);
    assert.deepEqual([first.row.fail_count, first.flag], [1, false]);
    const second = nextHealth("j2", first.row, gone, NOW + 24 * HOUR);
    assert.deepEqual([second.row.fail_count, second.flag], [2, true]);
    const temp = nextHealth("j2", first.row, { status: "error", http: null }, NOW + 24 * HOUR);
    assert.deepEqual([temp.row.fail_count, temp.flag], [1, false]);
    const rows = buildFeedbackRows({ flaggedLinks: [{ jobId: "j2", result: gone }], jobs: [], events: [], open: [], nowMs: NOW });
    assert.equal(rows[0].message, "The Apply link didn't open on 2 checks in a row (the website's address no longer exists).");
  });
  test("ok resets to 0", () => {
    assert.equal(nextHealth("j1", { fail_count: 5 }, { status: "ok", http: 200 }, NOW).row.fail_count, 0);
  });
});

describe("what is due", () => {
  const job = (id: string, extra: Partial<CheckableJob> = {}): CheckableJob => ({
    id,
    application_link: `https://jobs.example/${id}`,
    deadline: null,
    is_active: true,
    review_status: "approved",
    ...extra,
  });
  test("only active, approved jobs not checked in 20 h; never-checked first, then oldest; capped", () => {
    const jobs = [job("fresh"), job("old"), job("older"), job("never"), job("inactive", { is_active: false }), job("pending", { review_status: "pending" })];
    const health = new Map([
      ["fresh", { checked_at: new Date(NOW - 2 * HOUR).toISOString() }],
      ["old", { checked_at: new Date(NOW - 21 * HOUR).toISOString() }],
      ["older", { checked_at: new Date(NOW - 48 * HOUR).toISOString() }],
    ]);
    assert.deepEqual(selectDueJobs(jobs, health, NOW).map((j) => j.id), ["never", "older", "old"]);
    assert.deepEqual(selectDueJobs(jobs, health, NOW, 2).map((j) => j.id), ["never", "older"]);
  });

  test("checkJobs runs at most 4 at once and stops at the deadline", async () => {
    let inFlight = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, (_, i) => job(`j${i}`));
    const out = await checkJobs(jobs, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      return { status: "ok", http: 200 };
    });
    assert.equal(out.length, 10);
    assert.equal(peak, 4);

    let clock = 0;
    const partial = await checkJobs(jobs, async () => {
      clock += 10;
      return { status: "ok", http: 200 };
    }, { concurrency: 1, deadline: 30, now: () => clock });
    assert.equal(partial.length, 3);
  });

  test("closing dates are compared as Lagos dates", () => {
    assert.equal(deadlinePassed("2026-10-11", NOW), true);
    assert.equal(deadlinePassed("2026-10-12", NOW), false, "closing today is still open");
    // 23:30 UTC on the 11th is already the 12th in Lagos.
    assert.equal(deadlinePassed("2026-10-11", Date.parse("2026-10-11T23:30:00Z")), true);
    assert.equal(deadlinePassed(null, NOW), false);
    assert.equal(deadlinePassed("soon", NOW), false);
  });

  test("events: coalesce(ends_at, starts_at) more than 24 h ago", () => {
    const ev = (starts_at: string | null, ends_at: string | null, extra = {}) => ({ id: "e", kind: "event", is_active: true, starts_at, ends_at, ...extra });
    assert.equal(eventPassed(ev(new Date(NOW - 25 * HOUR).toISOString(), null), NOW), true);
    assert.equal(eventPassed(ev(new Date(NOW - 23 * HOUR).toISOString(), null), NOW), false);
    assert.equal(eventPassed(ev(new Date(NOW - 72 * HOUR).toISOString(), new Date(NOW - 2 * HOUR).toISOString()), NOW), false, "ends_at wins");
    assert.equal(eventPassed(ev(null, null), NOW), false);
    assert.equal(eventPassed(ev(new Date(NOW - 72 * HOUR).toISOString(), null, { kind: "announcement" }), NOW), false);
    assert.equal(eventPassed(ev(new Date(NOW - 72 * HOUR).toISOString(), null, { is_active: false }), NOW), false);
  });
});

describe("buildFeedbackRows", () => {
  const jobs: CheckableJob[] = [
    { id: "a", application_link: "https://jobs.example/a", deadline: "2026-10-01", is_active: true, review_status: "approved" },
    { id: "b", application_link: "https://jobs.example/b", deadline: "2026-12-01", is_active: true, review_status: "approved" },
  ];
  const events = [{ id: "ev1", kind: "event", is_active: true, starts_at: "2026-10-01T10:00:00Z", ends_at: null }];

  test("files link, deadline and event items with the exact wording", () => {
    const rows = buildFeedbackRows({ flaggedLinks: [{ jobId: "b", result: { status: "not_found", http: 404 } }], jobs, events, open: [], nowMs: NOW });
    assert.deepEqual(rows, [
      { source: "assistant", kind: "link", target_type: "job", target_id: "b", page_path: "/jobs/b", message: "The Apply link didn't open on 2 checks in a row (page not found, HTTP 404)." },
      { source: "assistant", kind: "wrong_info", target_type: "job", target_id: "a", page_path: "/jobs/a", message: DEADLINE_PASSED_MESSAGE },
      { source: "assistant", kind: "wrong_info", target_type: "announcement", target_id: "ev1", page_path: "/news", message: EVENT_PASSED_MESSAGE },
    ]);
    assert.equal(DEADLINE_PASSED_MESSAGE, "The closing date has passed but the job is still showing.");
    assert.equal(EVENT_PASSED_MESSAGE, "This event's date has passed but it's still showing.");
    const home = buildFeedbackRows({ flaggedLinks: [{ jobId: "b", result: { status: "redirect_home", http: 200 } }], jobs: [], events: [], open: [], nowMs: NOW });
    assert.match(home[0].message, /^The Apply link didn't open on 2 checks in a row \(.+\)\.$/);
  });

  test("never duplicates an open item, nor within one run", () => {
    const rows = buildFeedbackRows({
      flaggedLinks: [
        { jobId: "a", result: { status: "not_found", http: 404 } },
        { jobId: "a", result: { status: "not_found", http: 404 } },
      ],
      jobs,
      events,
      open: [
        { target_type: "job", target_id: "a", kind: "wrong_info" },
        { target_type: "announcement", target_id: "ev1", kind: "wrong_info" },
      ],
      nowMs: NOW,
    });
    assert.deepEqual(rows.map((r) => `${r.target_id}:${r.kind}`), ["a:link"]);
  });

  test("inactive or unapproved jobs are not flagged for a past deadline", () => {
    const rows = buildFeedbackRows({
      flaggedLinks: [],
      jobs: [{ ...jobs[0], is_active: false }, { ...jobs[0], id: "p", review_status: "pending" }],
      events: [],
      open: [],
      nowMs: NOW,
    });
    assert.equal(rows.length, 0);
  });
});
