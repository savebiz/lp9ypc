/**
 * Dedupe keys for scraped jobs: SHA-256 of
 * `lowercase(company)|lowercase(title)|normalised link` (lp9-safe-scraping).
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */
import { createHash } from "node:crypto";
import { linkKey } from "./link-validate.ts";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function squash(s: string): string {
  return String(s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 64-char hex key; stable across whitespace, case, tracking params and trailing slashes. */
export function jobDedupeKey(company: string, title: string, applicationLink: string): string {
  const link = linkKey(applicationLink) ?? squash(applicationLink);
  return sha256Hex(`${squash(company)}|${squash(title)}|${link}`);
}
