/**
 * robots.txt check for the job scraper (lp9-safe-scraping skill).
 *
 * - Fetched through the same SSRF guard as pages.
 * - If our product token ("LP9YPC-JobBot") or "*" is disallowed for the page
 *   path → skip the source and mark it "blocked".
 * - If robots.txt can't be fetched (404, timeout, …) → proceed.
 *
 * isAllowedByRobots() is pure (RFC 9309 matching: groups, longest match wins,
 * Allow wins ties, "*" and "$" wildcards) and unit-tested.
 */
import { safeFetchText, defaultFetchDeps, type SafeFetchDeps } from "./safe-fetch.ts";

export const ROBOTS_AGENT_TOKEN = "LP9YPC-JobBot";
const MAX_ROBOTS_BYTES = 512 * 1024; // RFC 9309 asks crawlers to parse at least 500 KiB

interface RobotsRule {
  allow: boolean;
  pattern: string;
}
interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;
  for (const rawLine of txt.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.split("/")[0].trim().toLowerCase());
      collectingAgents = true;
    } else if (key === "allow" || key === "disallow") {
      if (current) current.rules.push({ allow: key === "allow", pattern: value });
      collectingAgents = false;
    }
    // Other records (sitemap, crawl-delay, …) are ignored.
  }
  return groups;
}

/** `*` matches any run of characters; matching is anchored at the start. No regex → no ReDoS. */
function wildcardMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] !== "*" && pattern[p] === text[t]) {
      p++;
      t++;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p++;
      mark = t;
    } else if (star !== -1) {
      p = star + 1;
      t = ++mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") p++;
  return p === pattern.length;
}

function ruleMatches(pattern: string, path: string): boolean {
  if (pattern.endsWith("$")) return wildcardMatch(pattern.slice(0, -1), path);
  return wildcardMatch(`${pattern}*`, path);
}

/** True when robots.txt lets `agentToken` fetch `pathAndQuery` (e.g. "/jobs?page=2"). */
export function isAllowedByRobots(robotsTxt: string, pathAndQuery: string, agentToken: string = ROBOTS_AGENT_TOKEN): boolean {
  const groups = parseRobots(robotsTxt);
  const token = agentToken.toLowerCase();
  let rules = groups.filter((g) => g.agents.includes(token)).flatMap((g) => g.rules);
  if (rules.length === 0 && !groups.some((g) => g.agents.includes(token))) {
    rules = groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
  }

  const path = pathAndQuery || "/";
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!rule.pattern) continue; // "Disallow:" with no value allows everything
    if (!ruleMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** Fetches /robots.txt for the page's origin and checks the page path. Never throws. */
export async function checkRobots(
  pageUrl: string,
  opts: { timeoutMs?: number; deps?: SafeFetchDeps } = {},
): Promise<{ allowed: boolean; fetched: boolean }> {
  let target: URL;
  try {
    target = new URL(pageUrl);
  } catch {
    return { allowed: true, fetched: false };
  }
  const res = await safeFetchText(
    `${target.origin}/robots.txt`,
    { timeoutMs: opts.timeoutMs, maxBytes: MAX_ROBOTS_BYTES, contentTypes: ["text/plain", "text/html"] },
    opts.deps ?? defaultFetchDeps,
  );
  if (!res.ok) return { allowed: true, fetched: false };
  return { allowed: isAllowedByRobots(res.body, `${target.pathname}${target.search}`), fetched: true };
}
