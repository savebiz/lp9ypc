/**
 * Structured job extraction, no AI (Phase 3 job finder).
 *
 * Many job pages already publish machine-readable vacancies:
 *   - schema.org JobPosting in <script type="application/ld+json"> (Google
 *     for Jobs markup), including @graph containers, arrays and ItemLists;
 *   - RSS 2.0 / Atom feeds of vacancies.
 * The scraper tries this FIRST and only calls Gemini when nothing is found.
 *
 * Output items have exactly the shape validateExtractedJobs() accepts, so the
 * same code-side validation applies (lengths, enums, past deadlines, dedupe,
 * and the Apply link allow-list). For JSON-LD the Apply link must be on the
 * page OR be the posting's own url / applicationUrl on the same site as the
 * page; those same-site links are returned in `extraLinks` for the caller to
 * add to the allow-list. For feeds, item links are part of the fetched
 * document itself, so they are returned in `extraLinks` too.
 *
 * Everything here is untrusted page data: it is parsed, never executed.
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */
import { decodeEntities } from "./html-extract.ts";
import { normalizeLink } from "./link-validate.ts";

export const MAX_STRUCTURED_JOBS = 100;
const MAX_LD_BLOCKS = 50;
const MAX_LD_BLOCK_CHARS = 1_000_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 12;
const MAX_FEED_ITEMS = 200;
/** Feed items older than this (by pubDate/updated) are treated as stale. */
export const FEED_MAX_AGE_DAYS = 60;

export const FEED_CONTENT_TYPES = ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"];

/** One vacancy, in the shape validateExtractedJobs() accepts. */
export interface RawJob {
  title: string | null;
  company: string | null;
  location: string | null;
  work_mode: string;
  engagement_type: string;
  experience_level: string;
  deadline: string | null;
  description: string | null;
  application_link: string | null;
  salary_range: string | null;
  career_path_slug: string;
}

export interface StructuredExtraction {
  format: "jsonld" | "rss" | "atom" | null;
  /** Number of JobPosting nodes / feed items seen (before any validation). */
  seen: number;
  jobs: RawJob[];
  /** Links to add to the Apply-link allow-list (same-site posting URLs, or feed item links). */
  extraLinks: string[];
  /** Counts only, for agent_runs. */
  skipped: { no_link: number; stale: number };
}

export interface StructuredOptions {
  /** Links collected from the page's anchors (absolute). */
  pageLinks?: string[];
  /** Career-path slugs from the catalogue (for the keyword guess). */
  slugs?: string[];
  /** Today's date in Lagos, YYYY-MM-DD (for feed staleness). */
  today?: string;
}

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Small text helpers ──────────────────────────────────────────────────────

/** Strips tags (also HTML that was entity-encoded inside JSON/XML), decodes entities, collapses whitespace. */
export function plainText(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Descriptions are often entity-encoded HTML ("&lt;p&gt;…"): decode, strip, decode again.
  for (let i = 0; i < 2; i++) {
    s = s.replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
    s = s.replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>/gi, ". ");
    s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
    s = decodeEntities(s);
  }
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s*\.\s*(?:\.\s*)+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
}

/** Text value of a schema.org property: string, number, {name}, {@value} or the first of an array. */
function textOf(v: unknown, depth = 0): string | null {
  if (depth > 3 || v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = plainText(v);
    return t || null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    for (const item of v) {
      const t = textOf(item, depth + 1);
      if (t) return t;
    }
    return null;
  }
  if (isObj(v)) return textOf(v.name ?? v["@value"] ?? v.value, depth + 1);
  return null;
}

function asArray(v: unknown): unknown[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function stringsOf(v: unknown): string[] {
  return asArray(v)
    .map((x) => (typeof x === "string" ? x : isObj(x) && typeof x["@id"] === "string" ? x["@id"] : ""))
    .filter(Boolean);
}

/** One or two plain sentences, at most ~600 characters. */
export function shortDescription(raw: string | null): string | null {
  if (!raw) return null;
  const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    if ((out + " " + s).trim().length > 600) break;
    out = (out + " " + s).trim();
  }
  return (out || raw).slice(0, 600) || null;
}

/** "YYYY-MM-DD" from an ISO date/date-time, else null (validation re-checks it). */
function isoDate(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return m ? m[1] : null;
}

function hostKey(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Same site: identical host (ignoring www.), or one is a subdomain of the other. */
export function sameSite(a: string, b: string): boolean {
  const x = hostKey(a);
  const y = hostKey(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

// ── Enum mapping and career-path guess ──────────────────────────────────────

function mapEmployment(types: unknown, title: string): string {
  if (/graduate\s+trainee|trainee\s+programme|graduate\s+programme/i.test(title)) return "graduate-trainee";
  for (const t of asArray(types)) {
    const v = String(typeof t === "string" ? t : textOf(t) ?? "").toUpperCase().replace(/[\s-]+/g, "_");
    if (v.includes("FULL")) return "full-time";
    if (v.includes("PART")) return "part-time";
    if (v.includes("INTERN")) return "internship";
    if (v.includes("CONTRACT") || v.includes("TEMPORARY") || v.includes("FREELANCE") || v.includes("PER_DIEM")) return "contract";
  }
  if (/\bintern(ship)?\b/i.test(title)) return "internship";
  return "unknown";
}

function mapExperience(title: string, req: unknown): string {
  if (/\b(senior|sr\.?|lead|principal|head of|director)\b/i.test(title)) return "senior";
  if (/\b(junior|jr\.?|entry[\s-]level|graduate|intern|trainee|assistant)\b/i.test(title)) return "entry";
  const months = isObj(req) ? Number(req.monthsOfExperience) : NaN;
  if (Number.isFinite(months) && months >= 0) return months < 24 ? "entry" : months < 60 ? "mid" : "senior";
  return "unknown";
}

/**
 * Ordered keyword rules; the first rule whose pattern matches wins. Short
 * acronyms (IT, QA, HR, PR, HSE) are matched case-sensitively so ordinary
 * words like "it" or "pr" don't trigger them.
 */
const PATH_RULES: [RegExp, string][] = [
  [/\b(service desk|help ?desk|it support|system administrator|sysadmin|software|developers?|programmers?|front[\s-]?end|back[\s-]?end|full[\s-]?stack|devops|cloud|cyber\w*|data (?:analyst|scientist|engineer)|machine learning|product manager|network admin\w*|tester)\b/i, "tech-product"],
  [/\b(IT|QA|ICT)\b/, "tech-product"],
  [/\b(nurs\w*|doctors?|medical|pharmac\w*|clinical|health|laborator\w*|physiotherap\w*|nutrition\w*|dentist|midwi\w*)\b/i, "health-wellness"],
  [/\b(accountants?|accounting|account officer|finance|financial|audit\w*|tax|treasury|credit|banking|investment|actuar\w*|bookkeep\w*)\b/i, "finance-accounting"],
  [/\b(legal|lawyer|counsel|solicitor|attorney|paralegal|compliance|regulatory)\b/i, "law-compliance"],
  [/\b(human resources?|recruit\w*|talent acquisition|people (?:partner|operations)|payroll)\b/i, "human-resources"],
  [/\bHR\b/, "human-resources"],
  [/\b(graphic|designer|creative|ui\/ux|ux|video\w*|photograph\w*|animat\w*|fashion|illustrat\w*)\b/i, "creative-industries"],
  [/\b(journalis\w*|editor|content (?:writer|creator)|copywrit\w*|communications?|public relations|social media|broadcast\w*)\b/i, "media-communications"],
  [/\bPR\b/, "media-communications"],
  [/\b(engineer\w*|project manager|project management|quantity surveyor|construction)\b/i, "engineering-pm"],
  [/\bHSE\b/, "engineering-pm"],
  [/\b(policy|government|public sector|civil service)\b/i, "public-sector"],
  [/\b(sales|business development|marketing|operations|customer (?:service|support|success)|account manager|procurement|supply chain|logistics|retail|entrepreneur\w*)\b/i, "business-entrepreneurship"],
];

/** Best-guess career path from a title (then category/industry text), or "none". Admins review every job. */
export function guessCareerPath(texts: (string | null | undefined)[], slugs: string[]): string {
  const allowed = new Set(slugs);
  for (const text of texts) {
    if (!text) continue;
    for (const [re, slug] of PATH_RULES) {
      if (allowed.has(slug) && re.test(text)) return slug;
    }
  }
  return "none";
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

function isJobPosting(node: Obj): boolean {
  return asArray(node["@type"]).some((t) => typeof t === "string" && /(?:^|[/:#])JobPosting$/i.test(t.trim()));
}

/** Parses every application/ld+json block. Broken blocks are skipped. */
export function parseJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b([^>]{0,500})>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  let blocks = 0;
  while ((m = re.exec(html)) && blocks < MAX_LD_BLOCKS) {
    if (!/type\s*=\s*["']?\s*application\/ld\+json/i.test(m[1])) continue;
    blocks++;
    let raw = m[2];
    if (raw.length > MAX_LD_BLOCK_CHARS) continue;
    raw = raw
      .replace(/^\s*(?:<!--|\/\/\s*<!\[CDATA\[|<!\[CDATA\[)/, "")
      .replace(/(?:-->|\/\/\s*\]\]>|\]\]>)\s*$/, "")
      .trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Common publisher bug: raw newlines/tabs inside strings. Whitespace is
      // legal between tokens, so replacing control characters is safe.
      try {
        out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")));
      } catch {
        // unreadable block: skip
      }
    }
  }
  return out;
}

/** Finds JobPosting nodes anywhere in the parsed blocks (@graph, arrays, ItemList, mainEntity…). */
export function findJobPostings(blocks: unknown[]): Obj[] {
  const found: Obj[] = [];
  let visited = 0;
  const walk = (node: unknown, depth: number) => {
    if (depth > MAX_DEPTH || visited > MAX_NODES || found.length >= MAX_STRUCTURED_JOBS) return;
    visited++;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    if (isJobPosting(node)) {
      found.push(node);
      return;
    }
    for (const value of Object.values(node)) {
      if (typeof value === "object" && value !== null) walk(value, depth + 1);
    }
  };
  walk(blocks, 0);
  return found;
}

function locationOf(p: Obj): string | null {
  const parts: string[] = [];
  for (const place of asArray(p.jobLocation).slice(0, 3)) {
    if (typeof place === "string") {
      parts.push(plainText(place));
      continue;
    }
    if (!isObj(place)) continue;
    const addr = place.address;
    if (typeof addr === "string") {
      parts.push(plainText(addr));
    } else if (isObj(addr)) {
      const bits = [textOf(addr.addressLocality), textOf(addr.addressRegion), textOf(addr.addressCountry)].filter(
        (x): x is string => !!x,
      );
      const unique = bits.filter((b, i) => bits.findIndex((o) => o.toLowerCase() === b.toLowerCase()) === i);
      if (unique.length) parts.push(unique.join(", "));
    } else {
      const name = textOf(place.name);
      if (name) parts.push(name);
    }
  }
  const telecommute = asArray(p.jobLocationType).some((t) => /TELECOMMUTE/i.test(String(t)));
  if (telecommute) {
    const req = textOf(p.applicantLocationRequirements);
    if (!parts.length) parts.push(req ? `Remote (${req})` : "Remote");
  }
  const joined = [...new Set(parts.filter(Boolean))].join("; ");
  return joined || null;
}

function salaryOf(p: Obj): string | null {
  const s = p.baseSalary ?? p.estimatedSalary;
  if (s === null || s === undefined) return null;
  if (typeof s === "string" || typeof s === "number") return plainText(String(s)) || null;
  const amount = Array.isArray(s) ? s[0] : s;
  if (!isObj(amount)) return null;
  const currency = typeof amount.currency === "string" ? amount.currency.trim().slice(0, 5) : "";
  const value = amount.value;
  const fmt = (n: unknown) => {
    const x = typeof n === "string" ? Number(n.replace(/,/g, "")) : Number(n);
    return Number.isFinite(x) && x > 0 ? x.toLocaleString("en-US") : null;
  };
  let range: string | null = null;
  let unit = "";
  if (isObj(value)) {
    const min = fmt(value.minValue);
    const max = fmt(value.maxValue);
    const single = fmt(value.value);
    range = min && max && min !== max ? `${min}–${max}` : (min ?? max ?? single);
    unit = typeof value.unitText === "string" ? value.unitText : "";
  } else {
    range = fmt(value);
  }
  if (!unit && typeof amount.unitText === "string") unit = amount.unitText;
  if (!range) return null;
  const per = /^(hour|day|week|month|year)$/i.test(unit.trim()) ? ` per ${unit.trim().toLowerCase()}` : "";
  return `${currency ? `${currency} ` : ""}${range}${per}`.trim();
}

function linkCandidates(p: Obj): string[] {
  const out: string[] = [];
  for (const key of ["applicationUrl", "url", "sameAs", "@id"]) {
    for (const v of stringsOf(p[key])) out.push(v);
  }
  if (isObj(p.applicationContact)) for (const v of stringsOf(p.applicationContact.url)) out.push(v);
  return out;
}

function fromJsonLd(postings: Obj[], pageUrl: string, opts: StructuredOptions): StructuredExtraction {
  const pageLinkSet = new Set((opts.pageLinks ?? []).map((l) => normalizeLink(l)).filter(Boolean) as string[]);
  const slugs = opts.slugs ?? [];
  const jobs: RawJob[] = [];
  const extraLinks = new Set<string>();
  let noLink = 0;

  for (const p of postings) {
    const title = textOf(p.title) ?? textOf(p.name);
    const company = textOf(p.hiringOrganization);

    // Apply link: the posting's own link if it is on the page or on the same site.
    let link: string | null = null;
    for (const cand of linkCandidates(p)) {
      const abs = normalizeLink(cand, pageUrl);
      if (!abs) continue;
      if (pageLinkSet.has(abs)) {
        link = abs;
        break;
      }
      if (sameSite(abs, pageUrl)) {
        link = abs;
        extraLinks.add(abs);
        break;
      }
    }
    // A single-posting page with no own link: the page itself is the posting.
    if (!link && postings.length === 1) link = pageUrl;
    if (!link) {
      noLink++;
      continue;
    }

    const titleText = title ?? "";
    const telecommute = asArray(p.jobLocationType).some((t) => /TELECOMMUTE/i.test(String(t)));
    jobs.push({
      title,
      company,
      location: locationOf(p),
      work_mode: telecommute ? "remote" : /\bhybrid\b/i.test(titleText) ? "hybrid" : "unknown",
      engagement_type: mapEmployment(p.employmentType, titleText),
      experience_level: mapExperience(titleText, p.experienceRequirements),
      deadline: isoDate(p.validThrough),
      description: shortDescription(textOf(p.description)),
      application_link: link,
      salary_range: salaryOf(p),
      career_path_slug: guessCareerPath([titleText, textOf(p.occupationalCategory), textOf(p.industry)], slugs),
    });
  }
  return { format: "jsonld", seen: postings.length, jobs, extraLinks: [...extraLinks], skipped: { no_link: noLink, stale: 0 } };
}

// ── RSS / Atom ──────────────────────────────────────────────────────────────

/** True when the body is an RSS or Atom document (by content type or by sniffing). */
export function looksLikeFeed(body: string, contentType = ""): boolean {
  const head = String(body ?? "").replace(/^﻿/, "").trimStart().slice(0, 2000);
  if (/<rss\b|<feed\b[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom|<rdf:RDF\b/i.test(head)) return true;
  if (FEED_CONTENT_TYPES.includes(contentType) && contentType !== "application/xml" && contentType !== "text/xml") return true;
  return false;
}

function tagText(xml: string, names: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?(?:${names})\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?(?:${names})\\s*>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  const t = plainText(m[1]);
  return t || null;
}

function rawTagText(xml: string, names: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?(?:${names})\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?(?:${names})\\s*>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  const t = decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  return t || null;
}

function atomLink(entry: string): string | null {
  let fallback: string | null = null;
  for (const m of entry.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (!rel || rel === "alternate") return decodeEntities(href);
    fallback ??= decodeEntities(href);
  }
  return fallback;
}

/** Splits "Title at Company" or "Company: Title" when the feed has no company field. */
export function splitFeedTitle(title: string): { title: string; company: string | null } {
  const at = /^(.{2,160}?)\s+at\s+(.{2,160})$/i.exec(title);
  if (at) {
    const company = at[2]
      .trim()
      .replace(/\s*\(\s*\d+\s+(?:openings?|positions?|vacancies)\s*\)\s*$/i, "")
      .replace(/[.\s]+$/, "");
    return { title: at[1].trim(), company };
  }
  const colon = /^([^:]{2,80}):\s+(.{2,160})$/.exec(title);
  if (colon) return { title: colon[2].trim(), company: colon[1].trim() };
  return { title, company: null };
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function fromFeed(xml: string, pageUrl: string, opts: StructuredOptions): StructuredExtraction {
  const isAtom = !/<rss\b|<rdf:RDF\b/i.test(xml.slice(0, 2000)) && /<entry\b/i.test(xml);
  const itemRe = isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi : /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
  const slugs = opts.slugs ?? [];
  const jobs: RawJob[] = [];
  const extraLinks = new Set<string>();
  let seen = 0;
  let noLink = 0;
  let stale = 0;

  for (const m of xml.matchAll(itemRe)) {
    if (seen >= MAX_FEED_ITEMS || jobs.length >= MAX_STRUCTURED_JOBS) break;
    seen++;
    const item = m[1];
    const rawTitle = tagText(item, "title");
    if (!rawTitle) continue;

    const plainLink = /<link\s*>([\s\S]*?)<\/link\s*>/i.exec(item)?.[1];
    const rawLink = isAtom
      ? atomLink(item)
      : plainLink
        ? decodeEntities(plainLink.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim()
        : atomLink(item);
    const guid = /<guid\b[^>]*isPermaLink\s*=\s*["']true["'][^>]*>([\s\S]*?)<\/guid>/i.exec(item)?.[1];
    const link = normalizeLink(rawLink ?? (guid ? decodeEntities(guid) : ""), pageUrl);
    if (!link) {
      noLink++;
      continue;
    }

    const published = rawTagText(item, "pubDate|published|updated|date");
    if (opts.today && published && Number.isFinite(Date.parse(published))) {
      if (daysBetween(new Date(Date.parse(published)).toISOString().slice(0, 10), opts.today) > FEED_MAX_AGE_DAYS) {
        stale++;
        continue;
      }
    }

    const companyField = tagText(item, "company|company_name|companyName|hiringOrganization|employer");
    const split = companyField ? { title: rawTitle, company: companyField } : splitFeedTitle(rawTitle);
    const description = shortDescription(tagText(item, "description|summary|content|encoded"));
    const category = tagText(item, "category");
    const location = tagText(item, "location|job_location|region|city");
    const jobType = tagText(item, "job_type|jobType|type|employment_type");

    extraLinks.add(link);
    jobs.push({
      title: split.title,
      company: split.company,
      location,
      work_mode: /\bremote\b/i.test(`${location ?? ""} ${split.title}`) ? "remote" : /\bhybrid\b/i.test(split.title) ? "hybrid" : "unknown",
      engagement_type: mapEmployment(jobType ? [jobType] : [], split.title),
      experience_level: mapExperience(split.title, null),
      deadline: isoDate(rawTagText(item, "deadline|expires|expiry|closing_date|closingDate|validThrough")),
      description,
      application_link: link,
      salary_range: tagText(item, "salary|salary_range"),
      career_path_slug: guessCareerPath([split.title, category], slugs),
    });
  }
  return { format: isAtom ? "atom" : "rss", seen, jobs, extraLinks: [...extraLinks], skipped: { no_link: noLink, stale } };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Extracts vacancies from structured data in a fetched page or feed.
 * Returns format null and no jobs when the document has none (then the
 * scraper may fall back to the AI reader).
 */
export function extractStructuredJobs(body: string, pageUrl: string, contentType = "", opts: StructuredOptions = {}): StructuredExtraction {
  const empty: StructuredExtraction = { format: null, seen: 0, jobs: [], extraLinks: [], skipped: { no_link: 0, stale: 0 } };
  const text = String(body ?? "");
  if (!text) return empty;

  if (looksLikeFeed(text, contentType)) return fromFeed(text, pageUrl, opts);

  const postings = findJobPostings(parseJsonLdBlocks(text));
  if (postings.length === 0) return empty;
  return fromJsonLd(postings, pageUrl, opts);
}
