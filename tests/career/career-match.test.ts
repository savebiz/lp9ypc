// Run: node --test tests/career
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAREER_PATH_SLUGS, suggestPathSlugs } from "../../src/lib/career-match.ts";

function first(profession: string) {
  return suggestPathSlugs(profession)[0];
}

test("empty or blank professions give no suggestions", () => {
  assert.deepEqual(suggestPathSlugs(""), []);
  assert.deepEqual(suggestPathSlugs("   "), []);
  assert.deepEqual(suggestPathSlugs(null), []);
  assert.deepEqual(suggestPathSlugs(undefined), []);
});

test("unknown professions give no suggestions rather than a guess", () => {
  assert.deepEqual(suggestPathSlugs("Pastor"), []);
  assert.deepEqual(suggestPathSlugs("xyz"), []);
});

test("finance & accounting", () => {
  for (const p of ["Accountant", "  CHARTERED ACCOUNTANT. ", "Auditor", "Banker", "Bank teller", "Tax consultant", "Financial analyst", "Credit analyst"]) {
    assert.equal(first(p), "finance-accounting", p);
  }
});

test("tech & product", () => {
  for (const p of ["Software developer", "Data analyst", "Product manager", "IT support", "Cybersecurity analyst", "Frontend developer", "UI/UX designer"]) {
    assert.equal(first(p), "tech-product", p);
  }
});

test("health & wellness", () => {
  for (const p of ["Nurse", "Medical doctor", "Pharmacist", "Medical laboratory scientist", "Lab scientist", "Healthcare assistant", "Public health officer"]) {
    assert.equal(first(p), "health-wellness", p);
  }
});

test("law & compliance", () => {
  for (const p of ["Lawyer", "Legal officer", "Compliance analyst", "Legal counsel"]) {
    assert.equal(first(p), "law-compliance", p);
  }
});

test("engineering & project management", () => {
  for (const p of ["Civil engineer", "Mechanical engineer", "Electrical engineer", "Project manager", "Engineer"]) {
    assert.equal(first(p), "engineering-pm", p);
  }
});

test("human resources", () => {
  for (const p of ["HR manager", "Recruiter", "Recruitment officer", "Talent acquisition specialist", "People operations"]) {
    assert.equal(first(p), "human-resources", p);
  }
});

test("media & communications", () => {
  for (const p of ["Journalist", "PR executive", "Public relations officer", "Digital marketing", "Content writer", "Communications officer"]) {
    assert.equal(first(p), "media-communications", p);
  }
});

test("creative industries", () => {
  for (const p of ["Graphic designer", "Fashion designer", "Musician", "Photographer", "Filmmaker", "Artist"]) {
    assert.equal(first(p), "creative-industries", p);
  }
});

test("public sector", () => {
  for (const p of ["Civil servant", "Government official", "Public administrator", "Policy analyst"]) {
    assert.equal(first(p), "public-sector", p);
  }
});

test("business & entrepreneurship", () => {
  for (const p of ["Entrepreneur", "Founder", "Co-founder", "Business owner", "Sales executive", "Trader"]) {
    assert.equal(first(p), "business-entrepreneurship", p);
  }
});

test("ambiguous words resolve to the right field", () => {
  // "civil" is engineering unless it's the civil service.
  assert.ok(!suggestPathSlugs("Civil servant").includes("engineering-pm"));
  assert.ok(!suggestPathSlugs("Civil engineer").includes("public-sector"));
  // "public relations" is media, not the public sector.
  assert.ok(!suggestPathSlugs("Public relations officer").includes("public-sector"));
  // "IT" is only a whole word.
  assert.ok(!suggestPathSlugs("Recruitment officer").includes("tech-product"));
  // "lab" is not "labour"; "tax" is not "taxi".
  assert.ok(!suggestPathSlugs("Labour officer").includes("health-wellness"));
  assert.ok(!suggestPathSlugs("Taxi driver").includes("finance-accounting"));
  // A software engineer is tech first, engineering second.
  assert.deepEqual(suggestPathSlugs("Software engineer").slice(0, 2), ["tech-product", "engineering-pm"]);
  // A system administrator is tech; the weak "administrator" side-match is dropped.
  assert.deepEqual(suggestPathSlugs("System administrator"), ["tech-product"]);
});

test("results are valid, unique slugs and at most three", () => {
  const valid = new Set<string>(CAREER_PATH_SLUGS);
  for (const p of [
    "Accountant and software developer and nurse and lawyer",
    "Medical sales representative",
    "UI/UX designer",
    "Tax consultant",
  ]) {
    const out = suggestPathSlugs(p);
    assert.ok(out.length >= 1 && out.length <= 3, p);
    assert.equal(new Set(out).size, out.length, p);
    for (const s of out) assert.ok(valid.has(s), `${p} → ${s}`);
  }
});

test("multi-field professions keep the stronger and earlier fields first", () => {
  assert.deepEqual(suggestPathSlugs("Medical sales representative"), ["health-wellness", "business-entrepreneurship"]);
  assert.ok(suggestPathSlugs("UI/UX designer").includes("creative-industries"));
});
