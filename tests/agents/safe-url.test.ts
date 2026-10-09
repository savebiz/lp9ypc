import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkPublicUrl, checkResolvedAddresses, isBlockedIp, parseIPv6 } from "../../src/lib/agents/safe-url.ts";

function rejected(url: string): string {
  const r = checkPublicUrl(url);
  assert.equal(r.ok, false, `expected ${url} to be rejected`);
  return r.ok ? "" : r.code;
}

describe("checkPublicUrl", () => {
  test("rejects loopback, private, CGNAT, link-local and metadata IPv4 literals", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/", // decimal form of 127.0.0.1
      "http://0x7f.0.0.1/", // hex form
      "http://0.0.0.0/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.10/",
      "http://100.64.0.1/", // CGNAT
      "http://100.127.255.254/",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "http://192.0.0.8/",
      "http://198.18.0.1/",
      "http://224.0.0.1/",
      "http://255.255.255.255/",
    ]) {
      assert.equal(rejected(url), "blocked", url);
    }
  });

  test("rejects IPv6 loopback, unspecified, ULA, link-local, multicast and IPv4-mapped literals", () => {
    for (const url of [
      "http://[::1]/",
      "http://[::]/",
      "http://[fd12:3456::1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
      "http://[ff02::1]/",
      "http://[::ffff:127.0.0.1]/", // serialised by URL as [::ffff:7f00:1]
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[64:ff9b::7f00:1]/", // NAT64 of 127.0.0.1
      "http://[2002:a9fe:a9fe::1]/", // 6to4 of 169.254.169.254
    ]) {
      assert.equal(rejected(url), "blocked", url);
    }
  });

  test("rejects local hostnames", () => {
    for (const url of ["http://localhost/", "http://LOCALHOST./", "http://printer.local/", "http://db.internal/", "http://app.localhost/", "http://intranet/"]) {
      assert.equal(rejected(url), "blocked", url);
    }
  });

  test("rejects bad schemes, credentials and non-standard ports", () => {
    for (const url of [
      "ftp://example.com/file",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,hi",
      "http://user:pass@example.com/",
      "http://user@example.com/",
      "http://example.com:8080/",
      "https://example.com:22/",
      "not a url",
      "",
    ]) {
      assert.equal(rejected(url), "invalid", url);
    }
  });

  test("accepts ordinary public URLs", () => {
    for (const url of [
      "https://example.com/jobs",
      "http://jobs.example.com.ng/vacancies?page=2",
      "https://example.com:443/careers",
      "http://example.com:80/",
      "http://93.184.216.34/",
      "https://[2606:4700:4700::1111]/",
    ]) {
      const r = checkPublicUrl(url);
      assert.equal(r.ok, true, url);
    }
  });
});

describe("isBlockedIp (DNS answers)", () => {
  test("blocks private, reserved and mapped addresses; fails closed on garbage", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.5", "100.64.1.1", "169.254.169.254", "172.20.1.1", "192.168.0.1", "198.19.255.255",
      "::1", "::", "fd00::1", "fe80::1%eth0", "ff00::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:0:a00:1",
      "64:ff9b::a9fe:a9fe", "2001:db8::1", "not-an-ip", "",
    ]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
  });

  test("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "102.89.33.4", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8", "2606:4700::1111"]) {
      assert.equal(isBlockedIp(ip), false, ip);
    }
  });

  test("parseIPv6 expands :: and embedded IPv4", () => {
    assert.deepEqual(parseIPv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(parseIPv6("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    assert.deepEqual(parseIPv6("[2001:db8::]"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    assert.equal(parseIPv6("1:2:3:4:5:6:7:8:9"), null);
    assert.equal(parseIPv6("1::2::3"), null);
  });

  test("checkResolvedAddresses rejects when ANY answer is private, or none", () => {
    assert.equal(checkResolvedAddresses([]).ok, false);
    assert.equal(checkResolvedAddresses(["8.8.8.8", "10.0.0.1"]).ok, false);
    assert.equal(checkResolvedAddresses(["8.8.8.8", "2a00:1450::1"]).ok, true);
  });
});
