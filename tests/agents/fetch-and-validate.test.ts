import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { safeFetchText, type SafeFetchDeps } from "../../src/lib/agents/safe-fetch.ts";
import { isAllowedByRobots } from "../../src/lib/agents/robots.ts";
import { validDate, validateExtractedJobs } from "../../src/lib/agents/job-validate.ts";
import { validateResearchMapping } from "../../src/lib/agents/research-validate.ts";

/** Fake DNS + fetch: hosts map to addresses; urls map to responses. */
function deps(dns: Record<string, string[]>, pages: Record<string, () => Response>): SafeFetchDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    lookup: async (host) => {
      const a = dns[host];
      if (!a) throw new Error("ENOTFOUND");
      return a.map((address) => ({ address }));
    },
    fetch: async (url) => {
      fetched.push(url);
      const page = pages[url];
      return page ? page() : new Response("nope", { status: 404 });
    },
  };
}
const html = (body: string) => () => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

describe("safeFetchText (SSRF guard)", () => {
  test("fetches a public page", async () => {
    const d = deps({ "jobs.example": ["93.184.216.34"] }, { "https://jobs.example/careers": html("<p>Hi</p>") });
    const r = await safeFetchText("https://jobs.example/careers", {}, d);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.body, "<p>Hi</p>");
  });

  test("blocks a hostname that resolves to a private address (DNS-based SSRF)", async () => {
    const d = deps({ "intranet.example": ["10.0.0.7"] }, { "https://intranet.example/": html("secret") });
    const r = await safeFetchText("https://intranet.example/", {}, d);
    assert.equal(!r.ok && r.reason, "blocked_address");
    assert.equal(d.fetched.length, 0, "never connects");
  });

  test("blocks a redirect to the cloud metadata address", async () => {
    const d = deps(
      { "jobs.example": ["93.184.216.34"] },
      { "https://jobs.example/go": redirect("http://169.254.169.254/latest/meta-data/") },
    );
    const r = await safeFetchText("https://jobs.example/go", {}, d);
    assert.equal(!r.ok && r.reason, "blocked_address");
    assert.deepEqual(d.fetched, ["https://jobs.example/go"]);
  });

  test("blocks a redirect to a host that resolves privately, and stops after 3 hops", async () => {
    const d1 = deps(
      { "jobs.example": ["93.184.216.34"], "sneaky.example": ["192.168.1.10"] },
      { "https://jobs.example/a": redirect("https://sneaky.example/") },
    );
    assert.equal((await safeFetchText("https://jobs.example/a", {}, d1)).ok, false);

    const loop = deps({ "jobs.example": ["93.184.216.34"] }, {
      "https://jobs.example/1": redirect("/2"), "https://jobs.example/2": redirect("/3"),
      "https://jobs.example/3": redirect("/4"), "https://jobs.example/4": redirect("/5"),
    });
    const r = await safeFetchText("https://jobs.example/1", {}, loop);
    assert.equal(!r.ok && r.reason, "too_many_redirects");
  });

  test("rejects non-web content and caps the body size", async () => {
    const pdf = deps({ "jobs.example": ["93.184.216.34"] }, {
      "https://jobs.example/f.pdf": () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    assert.equal(((r) => !r.ok && r.reason)(await safeFetchText("https://jobs.example/f.pdf", {}, pdf)), "bad_content_type");

    const big = deps({ "jobs.example": ["93.184.216.34"] }, { "https://jobs.example/big": html("x".repeat(5000)) });
    const r = await safeFetchText("https://jobs.example/big", { maxBytes: 1000 }, big);
    assert.equal(r.ok && r.truncated, true);
    assert.ok(r.ok && r.body.length <= 1000);
  });

  test("rejects bad schemes, ports and credentials before any lookup", async () => {
    const d = deps({}, {});
    for (const u of ["file:///etc/passwd", "ftp://jobs.example/", "https://jobs.example:8443/", "https://u:p@jobs.example/"]) {
      assert.equal((await safeFetchText(u, {}, d)).ok, false, u);
    }
  });
});

describe("isAllowedByRobots", () => {
  const robots = `User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: BadBot\nDisallow: /`;
  test("follows the longest matching rule", () => {
    assert.equal(isAllowedByRobots(robots, "/careers"), true);
    assert.equal(isAllowedByRobots(robots, "/private/admin"), false);
    assert.equal(isAllowedByRobots(robots, "/private/jobs/12"), true);
  });
  test("empty or missing robots.txt allows everything", () => {
    assert.equal(isAllowedByRobots("", "/anything"), true);
    assert.equal(isAllowedByRobots("User-agent: *\nDisallow:", "/x"), true);
  });
});

describe("validateExtractedJobs", () => {
  const ctx = {
    pageUrl: "https://careers.example.org/jobs",
    pageLinks: ["https://careers.example.org/jobs/1", "https://careers.example.org/jobs/2"],
    slugs: ["finance-accounting", "tech-product"],
    today: "2026-10-09",
  };

  test("keeps valid jobs, normalising enums and the Apply link to the page's own copy", () => {
    const { jobs, dropped } = validateExtractedJobs({
      jobs: [{
        title: "  Junior   Accountant ", company: "Acme", location: "Ikeja", work_mode: "hybrid", engagement_type: "full-time",
        experience_level: "entry", deadline: "2026-11-01", description: "Help close the books.", application_link: "/jobs/1?utm_source=x",
        salary_range: "₦250k", career_path_slug: "finance-accounting",
      }],
    }, ctx);
    assert.equal(dropped.link_not_on_page, 0);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, "Junior Accountant");
    assert.equal(jobs[0].application_link, "https://careers.example.org/jobs/1");
    assert.equal(jobs[0].career_path_slug, "finance-accounting");
  });

  test("drops jobs whose Apply link isn't on the page, past deadlines, missing fields and duplicates", () => {
    const base = { title: "Analyst", company: "Acme", application_link: "https://careers.example.org/jobs/2" };
    const { jobs, dropped } = validateExtractedJobs({
      jobs: [
        { ...base, application_link: "https://phish.example/apply" },
        { ...base, deadline: "2026-10-01" },
        { company: "NoTitle Ltd", application_link: base.application_link },
        base,
        { ...base, title: "ANALYST" },
        "garbage",
      ],
    }, ctx);
    assert.equal(jobs.length, 1);
    assert.deepEqual(dropped, { missing_fields: 2, link_not_on_page: 1, past_deadline: 1, duplicate: 1 });
  });

  test("unknown enums/slugs become null; implausible deadlines are dropped to null", () => {
    const { jobs } = validateExtractedJobs({
      jobs: [{ title: "Dev", company: "X", application_link: ctx.pageUrl, work_mode: "space", career_path_slug: "astronaut", deadline: "2031-01-01" }],
    }, ctx);
    assert.equal(jobs[0].work_mode, null);
    assert.equal(jobs[0].career_path_slug, null);
    assert.equal(jobs[0].deadline, null);
  });

  test("validDate rejects impossible dates", () => {
    assert.equal(validDate("2026-02-30"), null);
    assert.equal(validDate("2026-12-31"), "2026-12-31");
    assert.equal(validDate("31/12/2026"), null);
  });
});

describe("validateResearchMapping", () => {
  const catalogue = [
    { slug: "finance-accounting", name: "Finance & Accounting" },
    { slug: "tech-product", name: "Tech & Product" },
    { slug: "business-entrepreneurship", name: "Business & Entrepreneurship" },
  ];
  test("keeps known slugs, keeps switch options distinct from matches, drops unknown ones", () => {
    const m = validateResearchMapping({
      summary: "Accountants are in demand.",
      matches: [{ slug: "finance-accounting", reason: "Direct fit" }, { slug: "made-up", reason: "x" }],
      switch_options: [{ slug: "finance-accounting", reason: "dup" }, { slug: "tech-product", reason: "Fintech" }],
      emerging_paths: [{ name: "Tech & Product", rationale: "already exists" }, { name: "ESG Reporting", rationale: "Growing" }],
    }, catalogue);
    assert.ok(m);
    assert.deepEqual(m!.matches.map((p) => p.slug), ["finance-accounting"]);
    assert.deepEqual(m!.switch_options.map((p) => p.slug), ["tech-product"]);
    assert.deepEqual(m!.emerging_paths.map((p) => p.name), ["ESG Reporting"]);
  });
  test("rejects non-objects", () => {
    assert.equal(validateResearchMapping(null, catalogue), null);
    assert.equal(validateResearchMapping([1, 2], catalogue), null);
  });
});
