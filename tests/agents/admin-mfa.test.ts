// Admin two-step sign-in rules (src/lib/supabase/mfa.ts) — kept in step with
// the database's is_admin() from migration 9.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminMfaRequired, decideAdminMfa, safeAdminNext } from "../../src/lib/supabase/mfa.ts";

describe("decideAdminMfa", () => {
  test("no app set up and not required → allowed", () => {
    assert.deepEqual(decideAdminMfa({ required: false, currentLevel: "aal1", hasVerifiedFactor: false }), { ok: true });
  });
  test("app set up → the code is needed even when not required (the database insists)", () => {
    assert.deepEqual(decideAdminMfa({ required: false, currentLevel: "aal1", hasVerifiedFactor: true }), { ok: false, next: "verify" });
    assert.deepEqual(decideAdminMfa({ required: true, currentLevel: null, hasVerifiedFactor: true }), { ok: false, next: "verify" });
  });
  test("required and no app → set one up", () => {
    assert.deepEqual(decideAdminMfa({ required: true, currentLevel: "aal1", hasVerifiedFactor: false }), { ok: false, next: "enrol" });
  });
  test("code entered (aal2) → allowed", () => {
    assert.deepEqual(decideAdminMfa({ required: true, currentLevel: "aal2", hasVerifiedFactor: true }), { ok: true });
  });
});

describe("settings and redirects", () => {
  test("ADMIN_MFA_REQUIRED accepts 'true' in any case, ignoring spaces", () => {
    assert.equal(adminMfaRequired({ ADMIN_MFA_REQUIRED: " TRUE " }), true);
    assert.equal(adminMfaRequired({ ADMIN_MFA_REQUIRED: "yes" }), false);
    assert.equal(adminMfaRequired({}), false);
  });
  test("after the code step, only admin pages are allowed", () => {
    assert.equal(safeAdminNext("/admin/security"), "/admin/security");
    assert.equal(safeAdminNext("//evil.example"), "/admin");
    assert.equal(safeAdminNext("/dashboard"), "/admin");
  });
});
