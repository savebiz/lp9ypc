/**
 * Local moderation heuristics. A hit forces HOLD whatever the AI says, and
 * works even when Gemini is unavailable (lp9-community-moderation).
 *
 * Deliberately narrow: these catch the patterns that are almost never fine in
 * a church young-professionals community (phone numbers, "pay to apply"
 * fees, bank details, crypto/forex money pitches). Everything else is left to
 * the moderation assistant and the human managers.
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */

export const MODERATION_CATEGORIES = [
  "harassment",
  "sexual",
  "minors",
  "scam",
  "payment_request",
  "personal_data",
  "self_harm",
  "spam",
  "violence",
  "other",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export function isModerationCategory(v: unknown): v is ModerationCategory {
  return typeof v === "string" && (MODERATION_CATEGORIES as readonly string[]).includes(v);
}

export interface LocalRuleResult {
  hit: boolean;
  categories: ModerationCategory[];
  /** For the community manager; never echoes the matched data itself. */
  reason: string;
}

// Nigerian mobile numbers: 0803 123 4567, 0803-123-4567, +234 803 123 4567, +234 (0) 803…, 2348031234567.
const NG_PHONE =
  /(?:^|[^\d])(?:(?:\+|00)\s*234|234|0)[\s.\-]*(?:\(\s*0\s*\)[\s.\-]*)?[789][01](?:[\s.\-]?\d){8}(?!\d)/;
// Other international numbers written with a leading "+" and 10–14 digits.
const INTL_PHONE = /(?:^|[^\d])\+\s*[1-9](?:[\s.\-()]{0,2}\d){9,13}(?!\d)/;

const FEE_PATTERNS = [
  /\b(?:registration|processing|application|screening|form|training|medical|interview|clearance|onboarding|verification)\s+fees?\b/i,
  /\bpay(?:ing|ment)?\s+(?:a\s+|an\s+|the\s+)?(?:small\s+|token\s+|one[-\s]time\s+)?(?:fee\s+|amount\s+)?(?:to|before)\s+(?:apply|applying|be\s+(?:shortlisted|employed|hired|considered)|get\s+(?:the\s+)?(?:job|shortlisted|hired)|secure\s+(?:the|a|your)\s+(?:job|slot|position|spot)|start)\b/i,
  /\bupfront\s+(?:fee|payment)s?\b/i,
];

// A 10-digit NUBAN account number (optionally grouped 3-3-4) next to banking words.
const ACCOUNT_NUMBER = /(?:^|[^\d])\d{3}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/;
const BANK_WORDS =
  /\b(?:bank|banks|acct|a\/c|account\s*(?:no|number|num|name|details)|nuban|gtb|gtbank|guaranty\s+trust|access\s+bank|zenith|uba|first\s*bank|fbn|opay|palmpay|kuda|moniepoint|wema|sterling|fidelity|polaris|stanbic|ecobank|fcmb|keystone|providus|jaiz)\b/i;

const DOUBLE_MONEY = /\bdouble\s+(?:your|ur|my)\s+(?:money|cash|investment|income|funds?)\b/i;
const GUARANTEED_RETURNS =
  /\bguaranteed\s+(?:daily\s+|weekly\s+|monthly\s+)?(?:returns?|profits?|roi|income|payouts?|interest)\b/i;
const INVEST_ASSET =
  /\b(?:crypto(?:currency|currencies)?|bitcoin|btc|usdt|ethereum|forex|fx\s+trading|binary\s+options?|investment\s+(?:plans?|platforms?|opportunit(?:y|ies)|schemes?|packages?))\b/i;
const MONEY_WORDS =
  /\b(?:invest(?:ment|ments|ing|or|ors)?|roi|profits?|returns?|earn(?:ings)?|payouts?|signals?|account\s+manager|mining)\b/i;
const PITCH_WORDS =
  /(?:guarantee|\bdaily\b|\bweekly\b|\bmonthly\b|\d\s?%|whatsapp|telegram|\bdm\s+me\b|inbox\s+me|message\s+me|contact\s+me|join\s+(?:my|our)|click\s+(?:the\s+|my\s+)?link|risk[-\s]free|no\s+risk|limited\s+slots?)/i;

function normalise(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "");
}

function looksLikeInvestmentPitch(text: string): boolean {
  if (DOUBLE_MONEY.test(text) || GUARANTEED_RETURNS.test(text)) return true;
  // All three signals in the same sentence keeps ordinary crypto/finance talk allowed.
  return text
    .split(/[!?\n]+|\.\s+/)
    .some((s) => INVEST_ASSET.test(s) && MONEY_WORDS.test(s) && PITCH_WORDS.test(s));
}

/** Runs every local rule over the post (title + body). */
export function checkLocalRules(text: string): LocalRuleResult {
  const t = normalise(text);
  const categories = new Set<ModerationCategory>();
  const reasons: string[] = [];

  if (NG_PHONE.test(t) || INTL_PHONE.test(t)) {
    categories.add("personal_data");
    reasons.push("Contains what looks like a phone number");
  }
  if (FEE_PATTERNS.some((re) => re.test(t))) {
    categories.add("scam");
    categories.add("payment_request");
    reasons.push("Mentions paying a fee to apply or be hired");
  }
  if (ACCOUNT_NUMBER.test(t) && BANK_WORDS.test(t)) {
    categories.add("payment_request");
    categories.add("personal_data");
    reasons.push("Contains what looks like bank account details");
  }
  if (looksLikeInvestmentPitch(t)) {
    categories.add("scam");
    reasons.push("Looks like a crypto/forex or 'double your money' investment pitch");
  }

  const reason = reasons.length ? `Held by automatic rules: ${reasons.join("; ")}.`.slice(0, 200) : "";
  return { hit: categories.size > 0, categories: [...categories], reason };
}
