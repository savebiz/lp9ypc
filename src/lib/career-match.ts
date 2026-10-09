// Instant career-path suggestions from a member's free-text profession.
//
// Pure and synchronous: no network, no database, no AI. It powers the
// "Suggested from your profession" list on registration step 3 and the
// dashboard fallback before the career-research agent has run. The agent's
// richer, sourced suggestions replace these once they exist.
//
// Relative import (not "@/…") so `node --test tests/career` can load this
// file directly with Node's built-in TypeScript type stripping.
import { normalizeProfession } from "./profession.ts";

/** The ten career-path slugs seeded by the initial migration. */
export const CAREER_PATH_SLUGS = [
  "tech-product",
  "finance-accounting",
  "media-communications",
  "law-compliance",
  "engineering-pm",
  "business-entrepreneurship",
  "public-sector",
  "human-resources",
  "health-wellness",
  "creative-industries",
] as const;

export type CareerPathSlug = (typeof CAREER_PATH_SLUGS)[number];

/** The owner-approved "What are you looking for?" answers (profiles.career_goal). */
export const CAREER_GOAL_OPTIONS = [
  { value: "grow", label: "Grow in my field" },
  { value: "switch", label: "Switch to a new field" },
  { value: "explore", label: "Not sure yet" },
] as const;

export const CAREER_GOAL_LABELS: Record<string, string> = Object.fromEntries(
  CAREER_GOAL_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * [pattern, weight]. Patterns run against the normalised profession
 * (lower-case, accents stripped, punctuation other than + # & / - removed).
 * Weight 3 = an unambiguous phrase, 2 = a specific word, 1 = a generic word
 * that only tips the balance (e.g. "engineer" loses to "software").
 */
type Rule = [RegExp, number];

const RULES: Record<CareerPathSlug, Rule[]> = {
  "tech-product": [
    [/\bsoftware\b/, 2],
    [/\bdevelopers?\b/, 2],
    [/\b(software|web|app|mobile|game)\s+development\b/, 3],
    [/\bprogramm(er|ing)\b/, 2],
    [/\bcoder\b|\bcoding\b/, 2],
    [/\bdata\b/, 2],
    [/\bproduct\s+(manager|management|owner|designer|lead|analyst)\b/, 3],
    [/\bproduct\b/, 1],
    [/\bit\b/, 2],
    [/\bict\b/, 2],
    [/\bcyber/, 2],
    [/\binformation\s+(technology|security|systems?)\b/, 3],
    [/\bweb\b/, 2],
    [/\b(front|back)[\s-]?end\b|\bfull[\s-]?stack\b/, 3],
    [/\bdevops\b|\bcloud\b|\bsre\b/, 2],
    [/\b(network|system|systems|database)\s+(engineer|administrator|admin|analyst)\b/, 3],
    [/\bsysadmin\b/, 3],
    [/\bcomputer\b/, 2],
    [/\btech\b|\btechnology\b|\bfintech\b|\bedtech\b/, 2],
    [/\bui\b|\bux\b/, 2],
    [/\bmachine\s+learning\b|\bai\b|\bml\b/, 2],
    [/\bscrum\b|\bagile\b/, 1],
    [/\bqa\b|\bsoftware\s+test/, 2],
  ],
  "finance-accounting": [
    [/\baccount(ant|ants|ing|ancy)\b/, 2],
    [/\baudit/, 2],
    [/\bbank/, 2],
    [/\btax(es|ation)?\b/, 2],
    [/\bfinanc/, 2],
    [/\bfintech\b/, 1],
    [/\binvestment|\binvestor/, 2],
    [/\btreasur/, 2],
    [/\bactuar/, 2],
    [/\beconomist|\beconomics\b/, 2],
    [/\binsurance\b|\bunderwriter/, 2],
    [/\bcredit\b|\bloan/, 2],
    [/\bbook\s?keep/, 2],
    [/\bpayroll\b/, 1],
    [/\bcashier\b|\bteller\b/, 1],
  ],
  "media-communications": [
    [/\bjournalis/, 2],
    [/\bpr\b/, 2],
    [/\bpublic\s+relations\b/, 3],
    [/\bmarket(ing|er)\b/, 2],
    [/\bcontent\b/, 2],
    [/\bmedia\b/, 2],
    [/\bcommunications?\b/, 2],
    [/\breporter\b|\beditor\b|\bbroadcast/, 2],
    [/\bcopywrit|\bwriter\b/, 2],
    [/\bbrand(ing)?\b|\badvertis/, 2],
    [/\bpresenter\b|\bon[\s-]air\b|\bradio\b/, 2],
  ],
  "law-compliance": [
    [/\blawyer/, 2],
    [/\blegal\b/, 2],
    [/\bcomplian/, 2],
    [/\blaw\b/, 2],
    [/\battorney\b|\bsolicitor\b|\bbarrister\b|\bparalegal\b|\bmagistrate\b|\bjudge\b/, 2],
    [/\bcounsel\b/, 2],
    [/\bregulat(ory|ion)\b/, 1],
  ],
  "engineering-pm": [
    [/\bengineer(s|ing)?\b/, 1],
    // "civil" alone is engineering — but not "civil servant" / "civil service".
    [/\bcivil\b(?!\s+serv)/, 2],
    [/\bmechanical\b|\belectrical\b|\belectronics?\b|\bchemical\b|\bstructural\b|\bpetroleum\b/, 2],
    [/\bproject\s+(manager|management|managers|lead|coordinator|officer|engineer)\b/, 3],
    [/\bpmp\b|\bprince2\b/, 3],
    [/\bproject\b/, 1],
    [/\bsurveyor\b|\bconstruction\b|\barchitect\b|\btechnician\b/, 1],
    [/\boil\s+(and|&)\s+gas\b/, 2],
    [/\bmanufactur/, 1],
  ],
  "business-entrepreneurship": [
    [/\bentrepreneur/, 3],
    [/\bfounder\b/, 3],
    [/\bbusiness\s+(owner|woman|man|development)\b|\bbusinessman\b|\bbusinesswoman\b/, 3],
    [/\bbusiness\b/, 1],
    [/\bsales\b|\bsalesman\b|\bsaleswoman\b|\bsalesperson\b/, 2],
    [/\btrader\b|\btrading\b|\bmerchant\b|\bretail/, 2],
    [/\bstart[\s-]?ups?\b|\bsmes?\b|\bceo\b/, 2],
    [/\bconsult/, 1],
    [/\blogistics\b|\bsupply\s+chain\b|\bprocurement\b/, 1],
    [/\breal\s+estate\b|\brealtor\b/, 2],
    [/\be[\s-]?commerce\b/, 2],
  ],
  "public-sector": [
    [/\bcivil\s+serv(ant|ants|ice)\b/, 3],
    [/\bpublic\s+serv(ant|ants|ice)\b/, 3],
    [/\bgovernment\b|\bgovt\b/, 2],
    // "public" alone — but not "public relations" (media) or "public health" (health).
    [/\bpublic\b(?!\s+(relations|health))/, 2],
    [/\badministrat(ion|ive|or)\b/, 1],
    [/\bpolicy\b|\bministry\b|\bparastatal\b|\blocal\s+government\b/, 2],
    [/\bngo\b|\bnon[\s-]?profit\b|\bdevelopment\s+(worker|practitioner)\b/, 2],
  ],
  "human-resources": [
    [/\bhr\b|\bhrm\b|\bhrbp\b/, 2],
    [/\bhuman\s+resources?\b/, 3],
    [/\brecruit/, 2],
    [/\btalent\b/, 2],
    [/\bpeople\b/, 2],
    [/\bpersonnel\b/, 2],
    [/\blearning\s+(and|&)\s+development\b|\bl\s*&\s*d\b/, 2],
  ],
  "health-wellness": [
    [/\bnurs(e|es|ing)\b/, 2],
    [/\bdoctor\b|\bphysician\b|\bsurgeon\b|\bmedic(al|ine)?\b/, 2],
    [/\bpharmac/, 2],
    // "lab" / "laboratory" — but not "labour".
    [/\blab\b|\blaboratory\b/, 2],
    [/\bhealth/, 2],
    [/\bpublic\s+health\b/, 3],
    [/\bdentist|\bdental\b|\bphysio|\btherapist\b|\boptometr|\bmidwi[fv]e?|\bradiograph/, 2],
    [/\bnutrition|\bdietitian|\bfitness\b|\bwellness\b|\bcaregiver\b/, 2],
    [/\bhospital\b|\bclinic(al)?\b/, 1],
  ],
  "creative-industries": [
    [/\bdesign(er|ers)?\b/, 1],
    [/\bgraphic|\billustrat|\banimat/, 2],
    [/\bartist/, 2],
    [/\barts?\b/, 1],
    [/\bmusic/, 2],
    [/\bfilm/, 2],
    [/\bfashion\b|\bstylist\b|\btailor\b|\bmake[\s-]?up\b/, 2],
    [/\bphotograph/, 2],
    [/\bvideo(grapher|graphy)?\b|\bcinematograph/, 2],
    [/\bactor\b|\bactress\b|\bperformer\b|\bproducer\b|\bcreative\b/, 2],
    [/\binterior\b/, 1],
  ],
};

/** At most this many suggestions — a short list is easier to act on. */
const MAX_SUGGESTIONS = 3;

/**
 * Best-first career-path slugs for a free-text profession, e.g.
 * "Software Engineer" → ["tech-product", "engineering-pm"].
 * Returns [] when nothing matches (the UI then simply shows every path).
 * Ties go to whichever field the member mentioned first. Weak side-matches
 * (under half the top score, e.g. "administrator" in "System administrator")
 * are dropped so the list stays relevant.
 */
export function suggestPathSlugs(profession: string | null | undefined): CareerPathSlug[] {
  const text = normalizeProfession(profession);
  if (!text) return [];

  const scored: { slug: CareerPathSlug; score: number; first: number; order: number }[] = [];
  CAREER_PATH_SLUGS.forEach((slug, order) => {
    let score = 0;
    let first = Infinity;
    for (const [pattern, weight] of RULES[slug]) {
      const m = pattern.exec(text);
      if (m) {
        score += weight;
        first = Math.min(first, m.index);
      }
    }
    if (score > 0) scored.push({ slug, score, first, order });
  });

  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score || a.first - b.first || a.order - b.order);
  const top = scored[0].score;
  return scored
    .filter((s) => s.score * 2 >= top)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.slug);
}
