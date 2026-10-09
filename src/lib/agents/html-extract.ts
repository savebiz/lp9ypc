/**
 * Turns a fetched job page into model-ready text plus the list of links that
 * are really on the page (see the lp9-safe-scraping skill).
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 *
 * In the text, each link appears in round brackets right after its label,
 * e.g. "Apply now (https://jobs.example.com/123)", so the model can tell which
 * link belongs to which job. The model's Apply link is later checked against
 * `links` — the text is only a hint.
 */

export const MAX_TEXT_CHARS = 60_000;
export const MAX_LINKS = 500;

export interface ExtractedPage {
  text: string;
  /** True when the text was cut at MAX_TEXT_CHARS. */
  truncated: boolean;
  /** Absolute http(s) links found on the page, de-duplicated, at most MAX_LINKS. */
  links: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  laquo: "«", raquo: "»", times: "×", euro: "€", pound: "£",
};

/** Decodes the common named entities plus decimal/hex character references. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[ent.toLowerCase()];
    return named ?? whole;
  });
}

/** Reads one attribute value (double-, single- or un-quoted) from a tag's attribute string. */
function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** Resolves an href against a base; returns an absolute http(s) URL or null. */
function resolveHttp(href: string, base: string): string | null {
  const cleaned = decodeEntities(href).trim();
  if (!cleaned) return null;
  try {
    const u = new URL(cleaned, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v  -​  　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function capText(s: string): { text: string; truncated: boolean } {
  if (s.length <= MAX_TEXT_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, MAX_TEXT_CHARS), truncated: true };
}

const BLOCK_TAGS =
  "address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|thead|tfoot|tr|ul";

/** Extracts readable text and the page's links from HTML. `pageUrl` is the FINAL URL after redirects. */
export function extractPage(html: string, pageUrl: string): ExtractedPage {
  // NUL is reserved for our own link placeholders below.
  let s = String(html ?? "").replace(/\u0000/g, "");

  // 1. Drop comments and elements that never hold visible job text.
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
  s = s.replace(/<(script|style|noscript|svg|template|iframe|object|canvas)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");

  // 2. A <base href> changes how relative links resolve in a browser.
  let base = pageUrl;
  const baseTag = /<base\b([^>]*)>/i.exec(s);
  if (baseTag) {
    const href = readAttr(baseTag[1], "href");
    const resolved = href ? resolveHttp(href, pageUrl) : null;
    if (resolved) base = resolved;
  }

  // 3. Collect links; replace each anchor with "label <placeholder>".
  const links: string[] = [];
  const indexOf = new Map<string, number>();
  const addLink = (href: string | null): number => {
    if (!href) return -1;
    const abs = resolveHttp(href, base);
    if (!abs) return -1;
    const known = indexOf.get(abs);
    if (known !== undefined) return known;
    if (links.length >= MAX_LINKS) return -1;
    indexOf.set(abs, links.length);
    links.push(abs);
    return links.length - 1;
  };

  // The inner match is bounded so a page full of unclosed <a> tags can't make
  // this quadratic (a hostile 2 MB page would otherwise outlive the cron).
  s = s.replace(/<a\b([^>]{0,2000})>([\s\S]{0,4000}?)<\/a\s*>/gi, (_m, attrs: string, inner: string) => {
    const idx = addLink(readAttr(attrs, "href"));
    return idx >= 0 ? ` ${inner} \u0000${idx}\u0000 ` : ` ${inner} `;
  });
  // Unclosed anchors and image-map areas still count as links on the page.
  s = s.replace(/<(?:a|area)\b([^>]*)>/gi, (_m, attrs: string) => {
    const idx = addLink(readAttr(attrs, "href"));
    return idx >= 0 ? ` \u0000${idx}\u0000 ` : " ";
  });

  // 4. Keep some structure, then strip every remaining tag.
  s = s.replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  s = s.replace(/<\/?(?:td|th)\b[^>]*>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/<![^>]*>/g, " ");

  // 5. Decode entities only AFTER tags are gone, so "&lt;script&gt;" stays text.
  s = decodeEntities(s);
  s = collapseWhitespace(s);
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `(${links[Number(i)]})`);
  s = s.replace(/\u0000/g, "");

  return { ...capText(s), links };
}

/** Same contract as extractPage() for text/plain pages: links are the bare URLs in the text. */
export function extractPlainText(body: string, pageUrl: string): ExtractedPage {
  const text = collapseWhitespace(String(body ?? "").replace(/\u0000/g, ""));
  const links: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'()]+/gi)) {
    const abs = resolveHttp(m[0].replace(/[.,;:!?]+$/, ""), pageUrl);
    if (abs && !seen.has(abs) && links.length < MAX_LINKS) {
      seen.add(abs);
      links.push(abs);
    }
  }
  return { ...capText(text), links };
}
