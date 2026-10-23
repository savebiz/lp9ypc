# Stage 1 contracts — "Unblock jobs" + foundations (2026-10-23)

Source: the think-tank review Victor approved on 2026-10-23 ("LP9 YPC Next Phase: Think-Tank Review"). Stage 1 = job review that keeps up, plus the engineering and security foundations. The stage gate: **fewer than 50 jobs waiting**.

Facts (live DB, 2026-10-23): 392 pending jobs (We Work Remotely 215, Hot Nigerian Jobs 175, Remotive 2); none older than 14 days; ~111 with no career path; 28 live; 2 admins. 4 communities showing (YPC Lounge, Faith & Fellowship, Tech & Product, new Jobs & Career Moves); 14 hidden.

Migration `supabase/migrations/20261023120000_job_review.sql` (tech lead; Victor applies it — it may not be live when you test: code to it and degrade gracefully on 42703 "column does not exist"): `jobs.relevance smallint 0–100`, `jobs.reject_reason` in `expired | not_eligible | duplicate | irrelevant | broken_link | other`, `jobs.reviewed_at`. Types in `src/types/index.ts` (`Job.relevance`, `Job.reject_reason`, `Job.reviewed_at`, `JobRejectReason`).

Rules for everyone: read `CLAUDE.md` and the lp9 skills; edit only the files you own; no new dependencies unless named here; no `next build`, no git; verify with `npx tsc --noEmit` and `node --test tests/agents tests/career`; plain English, mobile-first, 44px targets; never print secrets.

## A. Job finder controls (ai-agents-engineer)
Files: `src/lib/agents/**` (job-scraper, structured-jobs, new `job-relevance.ts`), `src/app/api/cron/job-scraper/**`, `tests/agents/**`, new `scripts/backfill-relevance.ts`.
- `scoreJob(job, ctx) → {score: 0–100, eligible: boolean, reasons: string[]}` — pure, tested. Signals: location eligibility (Nigeria/Lagos or a Nigerian city → high; worldwide/anywhere/"EMEA"/"Africa" remote → good; region-restricted e.g. "USA Only", "North America Only", "UK Only", "Europe Only", a US state, "Canada" → `eligible:false`); career path matched (+); member demand for that path (`ctx.membersPerPath`) (+); has a deadline in the future (+ small); title/company present; description present. Keep weights simple and documented.
- Job finder, on insert: set `relevance`; if `eligible:false` insert as `review_status 'rejected'`, `reject_reason 'not_eligible'`, `reviewed_at now()` (never shown to admins as pending).
- Per-source cap: skip inserting when that source already has ≥30 pending.
- Auto-expiry, each job-scraper run: pending jobs older than 14 days or with a passed deadline (Lagos date) → `rejected`, `reject_reason 'expired'`, `reviewed_at now()`. Live jobs are untouched (the link checker handles them).
- `scripts/backfill-relevance.ts` (Node 24, like `scripts/local-ai-worker.ts`, `--dry-run` supported): computes `relevance` for existing pending jobs and rejects ineligible ones with `not_eligible`. The tech lead runs it once.
- Handle a missing column (migration not applied) by inserting without the new fields.

## B. Review queue that keeps up (fullstack-admin-engineer)
Files: `src/app/admin/**`, new `src/app/api/admin/jobs/bulk/route.ts`.
- `POST /api/admin/jobs/bulk` `{ids: uuid[] (1–100), action: "approve" | "reject", reason?: JobRejectReason}`: `checkOrigin`, `requireAdmin`, service role; approve only jobs whose `application_link` is a safe http(s) URL (skip the rest and report them); sets `review_status`, `is_active` (approve → true), `reject_reason`, `reviewed_at`; one `writeAudit` row per call (`jobs.bulk_approve` / `jobs.bulk_reject`, details `{count, reason}`); returns `{approved, rejected, skipped}`.
- The admin page must stop loading every job: pending jobs come **paged from the server** (20 per page, sorted `relevance desc nulls last, created_at desc`) with filters (source, career path, minimum score, "Apply link looks OK"); live jobs list paged too; counts via `count: "exact", head: true` queries.
- Review queue UI: compact rows (title, company, source, location, score badge, career path, link domain), checkbox per row (only rows with a valid link can be selected for approve), "Select all on this page", sticky bar "Approve selected (n)" / "Reject selected (n)" with a reason picker (Expired, Not open to Nigeria, Duplicate, Not relevant, Broken link, Other), an Undo toast (≈8 s, calls the bulk route back) instead of `window.confirm`. Keep "Edit, then approve" for single jobs (existing JobEditor).
- Overview "Needs your attention": pending count with oldest age; "assistant problems in the last 24 h" (agent_runs with status error) as a line.
- Mobile-first: the queue must be usable one-handed at 375px.

## C. Member-side speed (member engineer)
Files: `src/app/jobs/**`, `src/components/jobs/**`, `src/app/dashboard/page.tsx` (jobs query only).
- `/jobs`: load 20 jobs at a time with "Show more" (server-paged or a capped first load + client fetch), select only the columns the cards show (no `select("*")` on jobs, no `career_paths(*)` — name/slug only). Filters and `?q=` keep working across pages (search server-side).
- Dashboard: cap its jobs query and select only needed columns.
- Keep one-tap Apply, the referral note and "Link not working?" exactly as they are.

## D. Foundations and admin two-step sign-in (platform engineer)
Files: new `.github/workflows/ci.yml`, `package.json` (scripts only), new `.gitattributes`, new `docs/backups.md` + `scripts/backup-db.ts`, `src/app/admin/security/**` (new page), `src/app/api/_lib/http.ts` (`requireAdmin` only), `src/lib/supabase/**` only if needed.
- CI on every pull request and push to `phase-1-mvp`: `npm ci --ignore-scripts`, `npx tsc --noEmit`, `node --test tests/agents tests/career`, `next build` with dummy public env, `npm audit --omit=dev --audit-level=high`. Add `"test"` script. No secrets in CI.
- `.gitattributes`: `* text=auto eol=lf` (no mass renormalisation in this change).
- Backups: `scripts/backup-db.ts` that VICTOR runs (exporting member data is his action, never automated by us): reads `.env.local`, exports every LP9 table to one dated JSON file in a folder he passes (refuse a path inside OneDrive), prints counts only. `docs/backups.md`: how to run it weekly, where to keep the file (encrypted drive / password manager), how to restore, and that Supabase Pro replaces this once members pass ~50.
- Admin two-step sign-in (Supabase Auth MFA, TOTP — built into supabase-js, no new dependency): `/admin/security` page to enrol an authenticator app (QR + code), verify, and list/remove factors; `requireAdmin()` and the admin page require `aal2` **only when** env `ADMIN_MFA_REQUIRED=true` (default off, so admins can enrol first; Victor turns it on in Vercel). If required and the admin's session is `aal1` with a factor enrolled → send them to a "Enter your 6-digit code" step; with no factor → send them to `/admin/security` to enrol. Plain-English copy.
