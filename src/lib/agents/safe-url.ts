/**
 * SSRF guard for admin-supplied URLs (see the lp9-safe-scraping skill).
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 * safe-fetch.ts runs these checks on the first URL AND on every redirect hop,
 * and checks every DNS answer with isBlockedIp().
 */

export type UrlCheck =
  | { ok: true; url: URL; host: string }
  | { ok: false; code: "invalid" | "blocked"; reason: string };

/** Hostname suffixes that only ever point inside a private network. */
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain", ".home.arpa"];

function invalid(reason: string): UrlCheck {
  return { ok: false, code: "invalid", reason };
}
function blocked(reason: string): UrlCheck {
  return { ok: false, code: "blocked", reason };
}

/** Lower-case hostname without IPv6 brackets or a trailing dot. */
export function bareHost(url: URL): string {
  let h = url.hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  while (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

/**
 * Steps 1–2 of the guard: scheme, credentials, port and hostname rules.
 * Bare IP literals are checked against the blocked ranges here; names are
 * checked again after DNS resolution (safe-fetch.ts).
 */
export function checkPublicUrl(raw: string): UrlCheck {
  if (typeof raw !== "string") return invalid("Not a valid web address.");
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return invalid("The web address is empty or too long.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return invalid("Not a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return invalid("Only http:// and https:// addresses are allowed.");
  }
  if (url.username || url.password) {
    return invalid("Addresses with a username or password in them are not allowed.");
  }
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return invalid("Only the standard web ports (80 and 443) are allowed.");
  }

  const host = bareHost(url);
  if (!host) return invalid("Not a valid web address.");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return blocked("Local network addresses are not allowed.");
  }
  if (parseIPv4(host) || host.includes(":")) {
    return isBlockedIp(host)
      ? blocked("Private or reserved IP addresses are not allowed.")
      : { ok: true, url, host };
  }
  // Single-label names ("intranet") only resolve inside private networks.
  if (!host.includes(".")) return blocked("Use a full public domain name.");
  return { ok: true, url, host };
}

/** Strict dotted-quad parser ("1.2.3.4"). Returns the four octets or null. */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function isBlockedIPv4(o: number[]): boolean {
  const [a, b, c] = o;
  return (
    a === 0 || // 0.0.0.0/8 "this network"
    a === 10 || // 10/8 private
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    a === 127 || // 127/8 loopback
    (a === 169 && b === 254) || // 169.254/16 link-local incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12 private
    (a === 192 && b === 0 && c === 0) || // 192.0.0/24 IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // 192.0.2/24 documentation
    (a === 192 && b === 168) || // 192.168/16 private
    (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
    (a === 198 && b === 51 && c === 100) || // 198.51.100/24 documentation
    (a === 203 && b === 0 && c === 113) || // 203.0.113/24 documentation
    a >= 224 // 224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast
  );
}

/** Parses an IPv6 address (optionally bracketed, with zone id or embedded IPv4) into 8 groups. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  let tail: number[] = [];
  if (s.includes(".")) {
    const lastColon = s.lastIndexOf(":");
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    let head = s.slice(0, lastColon + 1);
    if (!head.endsWith("::")) head = head.slice(0, -1);
    s = head;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!left || !right) return null;

  const explicit = left.length + right.length + tail.length;
  if (halves.length === 1) {
    return explicit === 8 ? [...left, ...tail] : null;
  }
  if (explicit > 7) return null;
  return [...left, ...new Array<number>(8 - explicit).fill(0), ...right, ...tail];
}

function v4FromGroups(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isBlockedIPv6(g: number[]): boolean {
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // ::ffff:a.b.c.d (IPv4-mapped) → judge the IPv4 address.
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedIPv4(v4FromGroups(g[6], g[7]));
  // ::ffff:0:a.b.c.d (IPv4-translated) → judge the IPv4 address.
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return isBlockedIPv4(v4FromGroups(g[6], g[7]));
  // ::/96 — unspecified (::), loopback (::1) and deprecated IPv4-compatible addresses.
  if (zeros(0, 6)) return true;
  // 64:ff9b::/96 NAT64 → judge the embedded IPv4; 64:ff9b:1::/48 local-use NAT64 → block.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    return zeros(2, 6) ? isBlockedIPv4(v4FromGroups(g[6], g[7])) : true;
  }
  // 2002::/16 6to4 → judge the embedded IPv4.
  if (g[0] === 0x2002) return isBlockedIPv4(v4FromGroups(g[1], g[2]));
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo 2001::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation 2001:db8::/32
  if (g[0] === 0x0100 && zeros(1, 4)) return true; // discard 100::/64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True when an IP address must never be fetched. Anything unparseable is blocked (fail closed). */
export function isBlockedIp(address: string): boolean {
  const v4 = parseIPv4(address.trim());
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isBlockedIPv6(v6);
  return true;
}

/** Step 3: every DNS answer must be public. Returns a reason when any is not. */
export function checkResolvedAddresses(addresses: string[]): { ok: true } | { ok: false; reason: string } {
  if (addresses.length === 0) return { ok: false, reason: "The site's address could not be found." };
  if (addresses.some((a) => isBlockedIp(a))) {
    return { ok: false, reason: "The site resolves to a private or reserved network address." };
  }
  return { ok: true };
}
