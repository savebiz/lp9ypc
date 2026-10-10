import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractStructuredJobs,
  findJobPostings,
  guessCareerPath,
  looksLikeFeed,
  parseJsonLdBlocks,
  plainText,
  sameSite,
  splitFeedTitle,
} from "../../src/lib/agents/structured-jobs.ts";
import { extractPage, extractMainContent, AI_TEXT_CHARS } from "../../src/lib/agents/html-extract.ts";
import { validateExtractedJobs } from "../../src/lib/agents/job-validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

const SLUGS = [
  "tech-product", "finance-accounting", "media-communications", "law-compliance", "engineering-pm",
  "business-entrepreneurship", "public-sector", "human-resources", "health-wellness", "creative-industries",
];
const TODAY = "2026-10-10";

describe("JSON-LD JobPosting", () => {
  const PAGE = "https://careers.example.ng/jobs/";
  const html = fixture("jsonld-graph.html");

  test("parses every ld+json block, tolerating raw newlines and skipping broken JSON", () => {
    const blocks = parseJsonLdBlocks(html);
    assert.equal(blocks.length, 2, "the broken block is skipped");
    const postings = findJobPostings(blocks);
    assert.equal(postings.length, 4, "@graph + array postings are all found");
  });

  test("maps postings to the validator's shape, with links on the page or on the same site", () => {
    const pageLinks = extractPage(html, PAGE).links;
    const r = extractStructuredJobs(html, PAGE, "text/html", { pageLinks, slugs: SLUGS, today: TODAY });
    assert.equal(r.format, "jsonld");
    assert.equal(r.seen, 4);
    assert.equal(r.skipped.no_link, 1, "the off-site injected posting has no acceptable link");
    assert.ok(!r.jobs.some((j) => j.application_link?.includes("evil.example")));

    const grad = r.jobs.find((j) => j.title?.startsWith("Graduate"))!;
    assert.equal(grad.title, "Graduate Trainee & Analyst");
    assert.equal(grad.company, "Example Bank Plc");
    assert.equal(grad.engagement_type, "graduate-trainee");
    assert.equal(grad.deadline, "2026-11-30");
    assert.equal(grad.location, "Victoria Island, Lagos, NG");
    assert.equal(grad.salary_range, "NGN 250,000–350,000 per month");
    assert.equal(grad.application_link, "https://careers.example.ng/jobs/graduate-trainee-2026");
    assert.ok(grad.description && !grad.description.includes("<") && !grad.description.includes("Third sentence"));

    const eng = r.jobs.find((j) => j.title === "Senior Software Engineer")!;
    assert.equal(eng.application_link, "https://ats.partner.example/apply/991", "off-site applicationUrl allowed because it is on the page");
    assert.equal(eng.work_mode, "remote");
    assert.equal(eng.location, "Remote (Nigeria)");
    assert.equal(eng.engagement_type, "contract");
    assert.equal(eng.experience_level, "senior");
    assert.equal(eng.career_path_slug, "tech-product");

    // Same validation as AI output: expired role dropped, everything else kept.
    const v = validateExtractedJobs({ jobs: r.jobs }, { pageUrl: PAGE, pageLinks: [...pageLinks, ...r.extraLinks], slugs: SLUGS, today: TODAY });
    assert.equal(v.jobs.length, 2);
    assert.equal(v.dropped.past_deadline, 1);
    assert.equal(v.dropped.link_not_on_page, 0);
  });

  test("a single posting with no url of its own uses the page URL", () => {
    const page = "https://acme.example/careers/hr-officer";
    const r = extractStructuredJobs(fixture("jsonld-single.html"), page, "text/html", { pageLinks: [], slugs: SLUGS });
    assert.equal(r.jobs.length, 1);
    const j = r.jobs[0];
    assert.equal(j.application_link, page);
    assert.equal(j.company, "Acme Foods Ltd");
    assert.equal(j.engagement_type, "part-time");
    assert.equal(j.location, "Ikeja, Lagos");
    assert.equal(j.career_path_slug, "human-resources");
    assert.equal(j.description, "Support recruitment and payroll for 200 staff.");
  });

  test("pages without JobPosting data report nothing (so the AI fallback can run)", () => {
    const r = extractStructuredJobs(`<script type="application/ld+json">{"@type":"Organization","name":"X"}</script><p>Hi</p>`, "https://x.example/", "text/html");
    assert.equal(r.format, null);
    assert.equal(r.jobs.length, 0);
  });
});

describe("RSS and Atom feeds", () => {
  test("RSS: items become jobs; company from a field or from 'Title at Company'; stale and bad links skipped", () => {
    const xml = fixture("jobs.rss");
    assert.equal(looksLikeFeed(xml, "application/xml"), true);
    const r = extractStructuredJobs(xml, "https://jobs.example.org/feed/", "application/rss+xml", { slugs: SLUGS, today: TODAY });
    assert.equal(r.format, "rss");
    assert.equal(r.skipped.stale, 1);
    assert.equal(r.skipped.no_link, 1);

    const acc = r.jobs.find((j) => j.application_link === "https://jobs.example.org/job/accountant-acme")!;
    assert.equal(acc.title, "Accountant");
    assert.equal(acc.company, "Acme Ltd");
    assert.equal(acc.career_path_slug, "finance-accounting");
    assert.match(acc.description ?? "", /^Acme Ltd is hiring an Accountant in Lagos\./);

    const social = r.jobs.find((j) => j.title === "Social Media Executive")!;
    assert.equal(social.company, "Bright Media & Co");
    assert.equal(social.location, "Remote");
    assert.equal(social.work_mode, "remote");
    assert.equal(social.engagement_type, "contract");
    assert.equal(social.career_path_slug, "media-communications");

    const v = validateExtractedJobs({ jobs: r.jobs }, { pageUrl: "https://jobs.example.org/feed/", pageLinks: r.extraLinks, slugs: SLUGS, today: TODAY });
    assert.equal(v.jobs.length, 2, "the item without a company is dropped by validation");
    assert.equal(v.dropped.missing_fields, 1);
  });

  test("Atom: alternate link, 'Company: Title' split, encoded summary", () => {
    const r = extractStructuredJobs(fixture("jobs.atom"), "https://remote.example.com/feed.atom", "application/atom+xml", { slugs: SLUGS, today: TODAY });
    assert.equal(r.format, "atom");
    assert.equal(r.jobs.length, 1);
    const j = r.jobs[0];
    assert.equal(j.application_link, "https://remote.example.com/jobs/globex-junior-data-analyst");
    assert.equal(j.company, "Globex");
    assert.equal(j.title, "Junior Data Analyst");
    assert.equal(j.experience_level, "entry");
    assert.equal(j.career_path_slug, "tech-product");
    assert.equal(j.description, "Analyse product data. Fully remote.");
  });
});

describe("helpers", () => {
  test("plainText strips (encoded) HTML and CDATA", () => {
    assert.equal(plainText("&lt;b&gt;Hi&lt;/b&gt; <![CDATA[there]]>"), "Hi there");
  });
  test("sameSite ignores www and allows subdomains, nothing else", () => {
    assert.equal(sameSite("https://www.example.ng/a", "https://example.ng/b"), true);
    assert.equal(sameSite("https://careers.example.ng/a", "https://example.ng/b"), true);
    assert.equal(sameSite("https://example.ng.evil.example/a", "https://example.ng/b"), false);
  });
  test("splitFeedTitle", () => {
    assert.deepEqual(splitFeedTitle("Nurse at St. Mary Hospital"), { title: "Nurse", company: "St. Mary Hospital" });
    assert.deepEqual(splitFeedTitle("Acme: Sales Lead"), { title: "Sales Lead", company: "Acme" });
    assert.deepEqual(splitFeedTitle("Just a title"), { title: "Just a title", company: null });
  });
  test("guessCareerPath: acronyms are case-sensitive and unknown slugs are never returned", () => {
    assert.equal(guessCareerPath(["Head of IT"], SLUGS), "tech-product");
    assert.equal(guessCareerPath(["Take it easy"], SLUGS), "none");
    assert.equal(guessCareerPath(["Civil Engineer"], SLUGS), "engineering-pm");
    assert.equal(guessCareerPath(["Accountant"], ["tech-product"]), "none");
  });
});

describe("extractMainContent (AI fallback input)", () => {
  test("uses <main>, drops chrome, caps at 12k chars, keeps every page link", () => {
    const filler = "Vacancy details. ".repeat(2000);
    const html = `<html><body><header><a href="/login">Log in</a> MENU MENU</header><nav><a href="/about">About</a></nav>
      <main><h1>Jobs</h1><p>${filler}</p><a href="/jobs/1">Apply</a></main><footer>FOOTER TEXT</footer></body></html>`;
    const page = extractMainContent(html, "https://site.example/jobs");
    assert.ok(page.text.length <= AI_TEXT_CHARS);
    assert.equal(page.truncated, true);
    assert.doesNotMatch(page.text, /MENU|FOOTER TEXT/);
    assert.ok(page.links.includes("https://site.example/login"), "allow-list still has links outside <main>");
    assert.ok(page.links.includes("https://site.example/jobs/1"));
  });
  test("without <main>, strips header/nav/footer from the body", () => {
    const body = "<p>" + "Real job text here. ".repeat(40) + "</p>";
    const page = extractMainContent(`<body><nav>NAVTEXT</nav>${body}<footer>FOOT</footer></body>`, "https://s.example/");
    assert.doesNotMatch(page.text, /NAVTEXT|FOOT/);
    assert.match(page.text, /Real job text here/);
  });
});

describe("security review L1/L2", () => {
  test("L1: 40k unclosed <script>, <item>, <entry> and chrome tags are processed quickly", async () => {
    const { removeElements, mainContentHtml } = await import("../../src/lib/agents/html-extract.ts");
    const cases: [string, () => unknown][] = [
      ["ld+json", () => extractStructuredJobs(`<html>${'<script type="application/ld+json">'.repeat(40_000)}</html>`, "https://x.example/", "text/html")],
      ["rss items", () => extractStructuredJobs(`<rss version="2.0"><channel>${"<item><title>".repeat(40_000)}</channel></rss>`, "https://x.example/feed", "application/rss+xml")],
      ["atom entries", () => extractStructuredJobs(`<feed xmlns="http://www.w3.org/2005/Atom">${"<entry><link ".repeat(40_000)}</feed>`, "https://x.example/f", "application/atom+xml")],
      ["chrome", () => removeElements("<nav>".repeat(40_000) + "<p>text</p>", "header|nav|footer|aside|form|dialog")],
      ["main", () => mainContentHtml(`<body>${"<main><aside>".repeat(40_000)}</body>`)],
      ["closed items", () => extractStructuredJobs(`<rss><channel>${"<item><title><title></item>".repeat(40_000)}</channel></rss>`, "https://x.example/feed", "application/rss+xml")],
    ];
    for (const [name, run] of cases) {
      const started = Date.now();
      run();
      const ms = Date.now() - started;
      assert.ok(ms < 2_000, `${name} took ${ms} ms`);
    }
  });

  test("L1: real chrome blocks are still removed", async () => {
    const { removeElements } = await import("../../src/lib/agents/html-extract.ts");
    assert.equal(removeElements("<NAV class=x>menu</NAV><p>keep</p><footer>f</footer>", "nav|footer").replace(/\s+/g, " ").trim(), "<p>keep</p>");
  });

  test("L2: same host (ignoring www) or a subdomain of the page host; never the parent or a sibling", () => {
    const page = "https://careers.example.ng/jobs/";
    assert.equal(sameSite("https://careers.example.ng/a", page), true);
    assert.equal(sameSite("https://www.careers.example.ng/a", page), true);
    assert.equal(sameSite("https://apply.careers.example.ng/a", page), true);
    assert.equal(sameSite("https://example.ng/a", page), false, "parent domain");
    assert.equal(sameSite("https://evil.example.ng/a", page), false, "sibling subdomain");
    assert.equal(sameSite("https://careers.example.ng.evil.example/a", page), false);
  });
});
