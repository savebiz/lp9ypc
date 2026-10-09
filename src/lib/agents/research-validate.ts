/**
 * Schema + code-side re-validation for the career-research mapping call
 * (call 2: research text → catalogue slugs).
 *
 * Pure: no network and no "@/" imports, so `node --test` can run it.
 */
import { cleanText } from "./job-validate.ts";

export interface CatalogueEntry {
  slug: string;
  name: string;
}

export interface PathPick {
  slug: string;
  reason: string;
}

export interface ResearchMapping {
  summary: string | null;
  matches: PathPick[];
  switch_options: PathPick[];
  emerging_paths: { name: string; rationale: string }[];
}

export const MAX_MATCHES = 3;
export const MAX_SWITCH = 4;
export const MAX_EMERGING = 2;

export function buildResearchSchema(catalogue: CatalogueEntry[]): Record<string, unknown> {
  const slugs = catalogue.map((c) => c.slug);
  const pick = {
    type: "object",
    properties: {
      slug: { type: "string", enum: slugs },
      reason: { type: "string", description: "One sentence, at most 200 characters." },
    },
    required: ["slug", "reason"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      summary: { type: "string", description: "2–4 plain sentences, at most 600 characters." },
      // No maxItems: Gemini rejects it on arrays of objects (HTTP 400); the
      // validator below caps each list instead.
      matches: { type: "array", items: pick },
      switch_options: { type: "array", items: pick },
      emerging_paths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short name, at most 60 characters." },
            rationale: { type: "string", description: "At most 300 characters." },
          },
          required: ["name", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "matches", "switch_options", "emerging_paths"],
    additionalProperties: false,
  };
}

function picks(raw: unknown, valid: Set<string>, taken: Set<string>, max: number): PathPick[] {
  if (!Array.isArray(raw)) return [];
  const out: PathPick[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (typeof item !== "object" || item === null) continue;
    const { slug, reason } = item as Record<string, unknown>;
    if (typeof slug !== "string" || !valid.has(slug) || taken.has(slug)) continue;
    taken.add(slug);
    out.push({ slug, reason: cleanText(reason, 300) ?? "" });
  }
  return out;
}

/**
 * Keeps only catalogue slugs; matches ≤ 3; switch options ≤ 4 and never a
 * repeat of a match; emerging paths ≤ 2 and never an existing catalogue name.
 * Returns null when the answer isn't an object at all.
 */
export function validateResearchMapping(raw: unknown, catalogue: CatalogueEntry[]): ResearchMapping | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const valid = new Set(catalogue.map((c) => c.slug));
  const taken = new Set<string>();
  const matches = picks(r.matches, valid, taken, MAX_MATCHES);
  const switch_options = picks(r.switch_options, valid, taken, MAX_SWITCH);

  const knownNames = new Set(catalogue.map((c) => c.name.toLowerCase()));
  const emerging_paths: ResearchMapping["emerging_paths"] = [];
  if (Array.isArray(r.emerging_paths)) {
    for (const item of r.emerging_paths) {
      if (emerging_paths.length >= MAX_EMERGING) break;
      if (typeof item !== "object" || item === null) continue;
      const e = item as Record<string, unknown>;
      const name = cleanText(e.name, 80);
      if (!name || knownNames.has(name.toLowerCase())) continue;
      if (emerging_paths.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
      emerging_paths.push({ name, rationale: cleanText(e.rationale, 1000) ?? "" });
    }
  }

  return { summary: cleanText(r.summary, 600), matches, switch_options, emerging_paths };
}
