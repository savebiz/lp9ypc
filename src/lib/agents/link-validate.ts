/**
 * Apply-link allow-listing (see the lp9-safe-scraping skill): a job's
 * application_link must normalise to one of the links actually present on the
 * fetched page, or the page URL itself. Anything else is dropped as
 * hallucinated or injected. The link we STORE is always the page's own copy.
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */

/** Absolute http(s) URL without credentials, or null. Relative links resolve against `base`. */
export function normalizeLink(raw: string, base?: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  try {
    const u = base ? new URL(trimmed, base) : new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Comparison key for "is this the same link?". Ignores scheme, a leading
 * "www.", a trailing slash, utm_* tracking parameters and the #fragment
 * (except single-page-app routes like "#/jobs/12", which identify a job).
 */
export function linkKey(raw: string, base?: string): string | null {
  const href = normalizeLink(raw, base);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const port = u.port ? `:${u.port}` : "";
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const params = [...u.searchParams.entries()].filter(([k]) => !/^utm_/i.test(k));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const hash = /^#!?\//.test(u.hash) ? u.hash : "";
  return `${host}${port}${path}${search}${hash}`;
}

/** Maps link keys → the page's own absolute link. The page URL itself is always allowed. */
export function buildLinkIndex(links: string[], pageUrl: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const link of [pageUrl, ...links]) {
    const href = normalizeLink(link);
    const key = href ? linkKey(href) : null;
    if (href && key && !index.has(key)) index.set(key, href);
  }
  return index;
}

/**
 * Returns the page's own copy of `candidate` when it is on the page (relative
 * candidates resolve against the page URL), otherwise null.
 */
export function matchPageLink(candidate: unknown, index: Map<string, string>, pageUrl: string): string | null {
  if (typeof candidate !== "string") return null;
  const key = linkKey(candidate, pageUrl);
  if (!key) return null;
  const found = index.get(key);
  return found && found.length <= 2000 ? found : null;
}
