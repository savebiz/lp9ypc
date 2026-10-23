// Stage 1 (docs/stage-1-contracts.md A): relevance score, eligibility,
// per-source cap, auto-expiry and the "migration not applied" fallback.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PENDING_CAP_PER_SOURCE,
  WEIGHTS,
  classifyLocation,
  demandPoints,
  expireStalePendingJobs,
  isMissingColumn,
  locationFromDescription,
  planBackfill,
  scoreJob,
  titleLocationHint,
  withoutReviewFields,
} from "../../src/lib/agents/job-relevance.ts";
import { foundMessage, runJobSource } from "../../src/lib/agents/job-scraper.ts";
import { extractStructuredJobs } from "../../src/lib/agents/structured-jobs.ts";
import type { SafeFetchDeps } from "../../src/lib/agents/safe-fetch.ts";

const TODAY = "2026-10-23";
const full = { title: "Accountant", company: "Acme Ltd", description: "Keep the books.", career_path_id: "p-fin" };

describe("scoreJob: location eligibility (calibrated on the live pending queue)", () => {
  const kind = (location: string | null, extra: Record<string, unknown> = {}) => classifyLocation({ ...full, location, ...extra }).kind;

  test("Nigeria / Lagos / Nigerian cities score highest", () => {
    assert.equal(kind("Victoria Island, Lagos, NG"), "lagos");
    assert.equal(kind("Yaba, Lagos State"), "lagos");
    assert.equal(kind("Abuja (FCT)"), "nigeria");
    assert.equal(kind("Ibadan, Oyo State"), "nigeria");
    assert.equal(kind("Remote (Nigeria)"), "nigeria");
    assert.equal(kind("USA, UK, Nigeria"), "nigeria", "Nigeria listed anywhere keeps it eligible");
  });

  test("worldwide / anywhere / EMEA / Africa are eligible", () => {
    assert.equal(kind("Anywhere in the World"), "worldwide");
    assert.equal(kind("Worldwide"), "worldwide");
    assert.equal(kind("Remote"), "worldwide");
    assert.equal(kind("EMEA Only"), "africa");
    assert.equal(kind("Europe, Middle East and Africa"), "africa");
    assert.equal(kind("Africa"), "africa");
    assert.equal(kind("Remote, US time zones"), "worldwide", "working hours don't limit where you live");
  });

  test("region-restricted locations are not eligible", () => {
    for (const loc of ["USA Only", "North America Only", "UK Only", "Europe Only", "California", "Austin, TX", "Canada", "Remote, US", "Anywhere in the US", "LATAM", "Germany", "APAC"]) {
      const r = scoreJob({ ...full, location: loc }, { today: TODAY });
      assert.equal(r.eligible, false, loc);
      assert.match(r.reasons[0], /not open to Nigeria/);
    }
  });

  test("unknown places stay eligible with a low score (a person decides)", () => {
    assert.equal(kind("Cairo Governorate", { work_mode: "remote" }), "other");
    assert.equal(scoreJob({ ...full, location: "Cairo Governorate", work_mode: "remote" }, { today: TODAY }).eligible, true);
    assert.equal(kind("Dubai, UAE"), "other");
    assert.equal(kind(null), "unknown");
  });

  test("a location-only title overrides a board's default 'Anywhere in the World'", () => {
    assert.equal(titleLocationHint("Account Development Representative - Canada"), "restricted");
    assert.equal(titleLocationHint("Marketing Automation Manager - Canada, Spain, India"), "restricted");
    assert.equal(titleLocationHint("Sales Lead (USA only)"), "restricted");
    assert.equal(titleLocationHint("CRM/ CVM / Lifecycle/Retention Marketing Lead (US b2c subscription only)"), null, "not a place");
    assert.equal(titleLocationHint("Front-End Developer - Senior"), null);
    assert.equal(titleLocationHint("Security Patrol Supervisor (Abuja)"), "nigeria");
    assert.equal(titleLocationHint("Support Engineer (EMEA)"), "africa");
    assert.equal(scoreJob({ ...full, title: "Account Development Representative - Canada", location: "Anywhere in the World" }).eligible, false);
    assert.equal(scoreJob({ ...full, title: "Retention Lead (US b2c subscription only)", location: "Anywhere in the World" }).eligible, true);
  });

  test("empty location: Nigerian boards' 'The position is located in …' sentence, then strong mentions", () => {
    const hnj = "Prec Pearl Nigeria Limited is recruiting to fill the position of: Accountant. The position is located in Yaba, Lagos State.";
    assert.equal(locationFromDescription(hnj), "Yaba, Lagos State");
    assert.equal(kind(null, { description: hnj }), "lagos");
    assert.equal(kind(null, { description: "The position is located in Ile-ife, Osun State." }), "nigeria");
    assert.equal(kind(null, { company: "KPMG Nigeria", description: "Build things." }), "nigeria");
    assert.equal(kind(null, { description: "Build things." }), "unknown");
  });
});

describe("scoreJob: weights", () => {
  test("weights add up to 100 and the best job scores 100", () => {
    const max = WEIGHTS.location.lagos + WEIGHTS.careerPath + WEIGHTS.demand + WEIGHTS.deadline + WEIGHTS.title + WEIGHTS.company + WEIGHTS.description;
    assert.equal(max, 100);
    const r = scoreJob({ ...full, location: "Lagos", deadline: "2026-11-30" }, { today: TODAY, membersPerPath: { "p-fin": 4, "p-tech": 2 } });
    assert.deepEqual(r, { score: 100, eligible: true, reasons: ["In Lagos", "Matches a career path 4 members follow", "Closing date ahead"] });
  });

  test("each signal moves the score", () => {
    const base = scoreJob({ ...full, location: "Anywhere in the World" }, { today: TODAY });
    assert.equal(base.score, 30 + 20 + 0 + 5 + 5 + 10);
    assert.equal(scoreJob({ ...full, location: "Anywhere in the World", career_path_id: null }, { today: TODAY }).score, base.score - 20);
    assert.equal(scoreJob({ ...full, location: "Anywhere in the World", description: "" }, { today: TODAY }).score, base.score - 10);
    assert.equal(scoreJob({ ...full, location: "Anywhere in the World", deadline: "2026-10-23" }, { today: TODAY }).score, base.score + 5, "closing today still counts");
    assert.equal(scoreJob({ ...full, location: "Anywhere in the World", deadline: "2026-10-22" }, { today: TODAY }).score, base.score, "a passed deadline earns nothing");
    assert.equal(scoreJob({ ...full, company: null, location: "Lagos" }, { today: TODAY }).reasons.includes("No company"), true);
  });

  test("member demand is relative to the busiest path, 0–15", () => {
    const counts = { a: 4, b: 2, c: 0 };
    assert.equal(demandPoints("a", counts), 15);
    assert.equal(demandPoints("b", counts), 8);
    assert.equal(demandPoints("c", counts), 0);
    assert.equal(demandPoints("missing", counts), 0);
    assert.equal(demandPoints("a", {}), 0);
    assert.equal(demandPoints(null, counts), 0);
  });

  test("scores stay within 0–100", () => {
    const r = scoreJob({ location: "USA Only" }, { today: TODAY });
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(r.eligible, false);
  });
});

describe("planBackfill", () => {
  test("groups eligible jobs by score and lists the ineligible ones", () => {
    const plan = planBackfill(
      [
        { id: "1", ...full, location: "Anywhere in the World" },
        { id: "2", ...full, location: "Anywhere in the World" },
        { id: "3", ...full, location: "USA Only" },
        { id: "4", ...full, location: null, description: "The position is located in Ikeja, Lagos State." },
      ],
      { today: TODAY },
    );
    assert.deepEqual(plan.scores.get(70), ["1", "2"]);
    assert.deepEqual(plan.scores.get(80), ["4"]);
    assert.deepEqual(plan.notEligible.map((n) => n.id), ["3"]);
    assert.equal(plan.all.length, 4);
  });
});

describe("missing-column fallback helpers", () => {
  test("42703 and PGRST204 mean the migration isn't applied", () => {
    assert.equal(isMissingColumn({ code: "42703" }), true);
    assert.equal(isMissingColumn({ code: "PGRST204" }), true);
    assert.equal(isMissingColumn({ code: "23505" }), false);
    assert.equal(isMissingColumn(null), false);
    assert.deepEqual(withoutReviewFields({ a: 1, relevance: 5, reject_reason: "x", reviewed_at: "t" }), { a: 1 });
  });
});

// ── A fake Supabase client: records queries, answers via a handler. ──

interface Op {
  table: string;
  action: "select" | "update" | "insert" | null;
  payload: unknown;
  filters: [string, string, unknown][];
  head: boolean;
}

function fakeAdmin(handler: (op: Op) => { data?: unknown; error?: { code?: string } | null; count?: number }) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, action: null, payload: null, filters: [], head: false };
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        update: (p: unknown) => ((op.action = "update"), (op.payload = p), b),
        insert: (p: unknown) => ((op.action = "insert"), (op.payload = p), b),
        select: (_cols?: string, o?: { head?: boolean }) => ((op.action ??= "select"), (op.head = !!o?.head), b),
        eq: (k: string, v: unknown) => (op.filters.push(["eq", k, v]), b),
        in: (k: string, v: unknown) => (op.filters.push(["in", k, v]), b),
        lt: (k: string, v: unknown) => (op.filters.push(["lt", k, v]), b),
        order: () => b,
        limit: () => b,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          ops.push(op);
          const out = handler(op);
          return Promise.resolve({ data: out.data ?? null, error: out.error ?? null, count: out.count ?? null }).then(res, rej);
        },
      });
      return b;
    },
  };
  return { ops, admin: client as unknown as SupabaseClient };
}

describe("expireStalePendingJobs (auto-expiry)", () => {
  const now = Date.parse("2026-10-23T05:00:00Z"); // 06:00 in Lagos

  test("pending jobs older than 14 days or past their Lagos closing date → rejected / expired", async () => {
    const { ops, admin } = fakeAdmin((op) => (op.action === "update" ? { data: op.filters[1][1] === "created_at" ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }] } : {}));
    const r = await expireStalePendingJobs(admin, now);
    assert.deepEqual(r, { ok: true, expired: 3, columnsMissing: false });
    const [age, deadline] = ops;
    assert.deepEqual(age.filters, [["eq", "review_status", "pending"], ["lt", "created_at", "2026-10-09T05:00:00.000Z"]]);
    assert.deepEqual(deadline.filters, [["eq", "review_status", "pending"], ["lt", "deadline", "2026-10-23"]]);
    assert.deepEqual(age.payload, { review_status: "rejected", is_active: false, reject_reason: "expired", reviewed_at: "2026-10-23T05:00:00.000Z" });
  });

  test("migration not applied (PGRST204) → still expires, without reason/date", async () => {
    const { ops, admin } = fakeAdmin((op) => {
      if (op.action !== "update") return {};
      return "reject_reason" in (op.payload as object) ? { error: { code: "PGRST204" } } : { data: [{ id: "a" }] };
    });
    const r = await expireStalePendingJobs(admin, now);
    assert.deepEqual(r, { ok: true, expired: 2, columnsMissing: true });
    assert.deepEqual(ops.at(-1)!.payload, { review_status: "rejected", is_active: false });
  });

  test("never throws; reports a failure", async () => {
    const r = await expireStalePendingJobs({ from() { throw new Error("boom"); } } as unknown as SupabaseClient, now);
    assert.equal(r.ok, false);
  });
});

// ── runJobSource: scoring, not-eligible set-aside, per-source cap ──

const CATALOGUE = [
  { id: "p-tech", slug: "tech-product", name: "Tech & Product" },
  { id: "p-fin", slug: "finance-accounting", name: "Finance & Accounting" },
];
const FEED_URL = "https://jobs.example.org/feed/";
const pub = new Date().toUTCString();
const item = (slug: string, title: string, location: string) =>
  `<item><title>${title}</title><link>https://jobs.example.org/job/${slug}</link><pubDate>${pub}</pubDate><location>${location}</location><description>A real job.</description></item>`;
const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>
${item("dev", "Software Developer at Acme", "Anywhere in the World")}
${item("acct", "Accountant at Bolt", "Lagos")}
${item("us", "Software Engineer at Initech", "USA Only")}
</channel></rss>`;

function feedDeps(): SafeFetchDeps {
  return {
    lookup: async () => [{ address: "93.184.216.34" }],
    fetch: async (url) =>
      url === FEED_URL
        ? new Response(FEED, { status: 200, headers: { "content-type": "application/rss+xml" } })
        : new Response("not found", { status: 404, headers: { "content-type": "text/plain" } }),
  };
}

function scraperAdmin(pending: number, insertError?: (rows: Record<string, unknown>[]) => { code: string } | null) {
  return fakeAdmin((op) => {
    if (op.table === "jobs" && op.action === "select") return op.head ? { count: pending } : { data: [] };
    if (op.table === "jobs" && op.action === "insert") return { error: insertError?.(op.payload as Record<string, unknown>[]) ?? null };
    return {};
  });
}
const opts = { catalogue: CATALOGUE, fetchDeps: feedDeps(), membersPerPath: { "p-tech": 3, "p-fin": 1 } };
const inserts = (ops: Op[]) => ops.filter((o) => o.table === "jobs" && o.action === "insert");

describe("runJobSource with relevance", () => {
  test("eligible jobs → pending with relevance; region-restricted → rejected / not_eligible", async () => {
    const { ops, admin } = scraperAdmin(0);
    const r = await runJobSource(admin, { id: "s-1", name: "Feed", url: FEED_URL }, { ...opts, deadline: Date.now() + 55_000 });
    assert.equal(r.status, "ok");
    assert.equal(r.inserted, 2);
    assert.equal(r.details.not_eligible, 1);
    assert.equal(r.message, "Found 3 jobs; 2 new added to the review queue. 1 not open to applicants in Nigeria was set aside.");
    const rows = inserts(ops)[0].payload as Record<string, unknown>[];
    const byTitle = (t: string) => rows.find((x) => x.title === t)!;
    assert.equal(byTitle("Software Developer").review_status, "pending");
    assert.equal(byTitle("Software Developer").relevance, 30 + 20 + 15 + 5 + 5 + 10);
    assert.equal(byTitle("Accountant").relevance, 40 + 20 + 5 + 5 + 5 + 10);
    const us = byTitle("Software Engineer");
    assert.equal(us.review_status, "rejected");
    assert.equal(us.reject_reason, "not_eligible");
    assert.equal(us.is_active, false);
    assert.equal(typeof us.reviewed_at, "string");
    assert.equal(byTitle("Accountant").reject_reason, undefined);
  });

  test(`per-source cap: ${PENDING_CAP_PER_SOURCE} already waiting → no new pending jobs (ineligible still set aside)`, async () => {
    const { ops, admin } = scraperAdmin(PENDING_CAP_PER_SOURCE);
    const r = await runJobSource(admin, { id: "s-1", name: "Feed", url: FEED_URL }, { ...opts, deadline: Date.now() + 55_000 });
    assert.equal(r.status, "ok");
    assert.equal(r.inserted, 0);
    assert.equal(r.details.capped, 2);
    const rows = inserts(ops)[0].payload as Record<string, unknown>[];
    assert.deepEqual(rows.map((x) => x.review_status), ["rejected"]);
    assert.match(r.message, /none added to the review queue.*2 more will be added once this source has fewer than 30/);
    const count = ops.find((o) => o.head)!;
    assert.deepEqual(count.filters, [["eq", "source_id", "s-1"], ["eq", "review_status", "pending"]]);
  });

  test("below the cap only the room left is used, best score first", async () => {
    const { ops, admin } = scraperAdmin(PENDING_CAP_PER_SOURCE - 1);
    // Finance is now the busiest path: Accountant (Lagos) 95 beats Software Developer (worldwide) 75.
    const r = await runJobSource(admin, { id: "s-1", name: "Feed", url: FEED_URL }, { ...opts, membersPerPath: { "p-tech": 1, "p-fin": 3 }, deadline: Date.now() + 55_000 });
    assert.equal(r.inserted, 1);
    assert.equal(r.details.capped, 1);
    const rows = inserts(ops)[0].payload as Record<string, unknown>[];
    assert.deepEqual(rows.filter((x) => x.review_status === "pending").map((x) => [x.title, x.relevance]), [["Accountant", 95]]);
  });

  test("migration not applied → inserts again without relevance / reject_reason / reviewed_at", async () => {
    const { ops, admin } = scraperAdmin(0, (rows) => ("relevance" in rows[0] ? { code: "PGRST204" } : null));
    const r = await runJobSource(admin, { id: "s-1", name: "Feed", url: FEED_URL }, { ...opts, deadline: Date.now() + 55_000 });
    assert.equal(r.status, "ok");
    assert.equal(r.inserted, 2);
    assert.equal(r.details.review_columns_missing, true);
    const second = inserts(ops)[1].payload as Record<string, unknown>[];
    assert.ok(second.every((x) => !("relevance" in x) && !("reject_reason" in x) && !("reviewed_at" in x)));
    assert.equal(second.find((x) => x.title === "Software Engineer")!.review_status, "rejected", "still never pending");
  });

  test("dry run scores but saves nothing", async () => {
    const { ops, admin } = scraperAdmin(0);
    const r = await runJobSource(admin, { id: "s-1", name: "Feed", url: FEED_URL }, { ...opts, dryRun: true, deadline: Date.now() + 55_000 });
    assert.equal(inserts(ops).length, 0);
    assert.equal(r.details.dry_run_not_eligible, 1);
  });

  test("foundMessage keeps the original sentences when nothing was set aside", () => {
    assert.equal(foundMessage(2, { inserted: 2, notEligible: 0, capped: 0 }), "Found 2 jobs; 2 new added to the review queue.");
    assert.equal(foundMessage(1, { inserted: 0, notEligible: 0, capped: 0 }), "Found 1 job, all already in the system.");
  });
});

describe("feeds without a location tag", () => {
  test("location comes from 'The position is located in …'", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Accountant at Prec Pearl Nigeria Limited</title><link>https://hnj.example/job/1</link><description>Prec Pearl Nigeria Limited is recruiting to fill the position of: Accountant. The position is located in Yaba, Lagos State. Apply now.</description></item></channel></rss>`;
    const r = extractStructuredJobs(xml, "https://hnj.example/feed", "application/rss+xml", { slugs: ["finance-accounting"] });
    assert.equal(r.jobs[0].location, "Yaba, Lagos State");
  });
});
