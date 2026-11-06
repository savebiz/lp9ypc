# Stage 2 contracts — "Bring members back" (2026-11-06)

Source: the think-tank plan Victor approved (2026-10-23) and his go-ahead on 2026-11-06. Victor's choice for the digest: **WhatsApp first, email later** — no email service in this stage. The stage gate: **the digest is sent and Apply taps are counted**.

Facts (live DB, 2026-11-06): 9 real members, 0 sign-ups and 0 new discussions in the last 14 days; 29 live jobs; 863 jobs waiting (stage 1 is built but not yet merged).

Migration `supabase/migrations/20261106120000_admin_aal_and_apply_taps.sql` (tech lead; Victor applies it — may not be live when you test: degrade gracefully on 42P01/42883/PGRST202):
- `apply_clicks (id, job_id, member_id null for visitors, source 'card'|'detail'|'dashboard'|'welcome', created_at)`: RLS on, no grants — only the server writes with the service role; nobody reads rows.
- `apply_weekly(p_weeks int default 8) → (week_start date, applying_members, member_taps, visitor_taps)`: admins only (raises 42501 otherwise), weeks start Monday, Lagos time.
- `is_admin()` now needs aal2 for admins with a verified authenticator app (already mirrored in `src/lib/supabase/mfa.ts`).

Rules for everyone: read `CLAUDE.md` and the lp9 skills; edit only your files; no new dependencies; no `next build`, no git; verify with `npx tsc --noEmit` and `npm test`; plain British English; mobile-first, 44px targets; never print secrets. **Apply stays one tap**: counting must never delay, block or change the link.

## A. Members (member engineer)
Files: new `src/app/api/apply-tap/route.ts`; `src/components/jobs/ApplyButton.tsx` (+ the components that render it, to pass `source`); `src/app/dashboard/**`; new `src/components/welcome/**`; `src/app/privacy/page.tsx`.
- `POST /api/apply-tap` `{jobId, source}`: `checkOrigin`; accepts signed-in members and visitors (member_id from the session if there is one, else null); validates `jobId` is a live approved job; per-IP+job de-dupe (ignore a repeat tap on the same job within 10 minutes — in-memory map, best effort) and a body cap; inserts with the service role; always answers `204` quickly (never an error page for the member).
- `ApplyButton`: keep the plain `<a href target=_blank>`; on click call `navigator.sendBeacon('/api/apply-tap', Blob(JSON))` (fallback `fetch(..., {keepalive:true})`), wrapped in try/catch, no `preventDefault`. Add a `source` prop ('card' | 'detail' | 'dashboard' | 'welcome').
- Welcome screen on `/dashboard?welcome=1` (sign-up already lands there): a short panel above the dashboard — "Welcome to YPC, {first name}." then (1) up to 3 jobs for their career paths (one-tap Apply, `source='welcome'`), (2) the communities for their career paths plus YPC Lounge with Join buttons (reuse `JoinButton`), (3) "Get jobs every Monday: ask your parish YPC champion to add you to the club's WhatsApp group" (no link — the club shares it in person), and a "Go to my dashboard" button that removes `?welcome=1`. Dismissible; shown once per device (localStorage).
- "Since you were last here" strip at the top of the dashboard (returning members): new jobs on their career paths since their last visit, replies to their discussions since then, and the next upcoming event. "Last visit" = a timestamp in localStorage per device (no schema change); first visit shows nothing. Each item links to the right place.
- Privacy policy: under what we collect, add that we count taps on Apply (which job, when, and your account if signed in) to measure whether the platform helps people apply; only admins see totals, never individual taps; kept 12 months. Update LAST_UPDATED.

## B. Admin (fullstack-admin-engineer)
Files: `src/app/admin/**`, new `src/app/api/admin/digest/route.ts` only if needed.
- New "Weekly digest" tab: generates WhatsApp-ready plain text for the week (Monday to Sunday, Lagos time, with a "since" date picker):
  - "LP9 YPC — jobs this week" with up to 3 new live jobs per career path (highest `relevance` first, then newest), each `• Title — Company (Location)` + its `https://lp9ypc.vercel.app/jobs/<id>` link; paths with no new jobs are left out; a total line ("27 new jobs this week — see them all: …/jobs").
  - The next 2 upcoming events (title, day and time in Lagos time, place, link to /news).
  - Up to 3 active discussions from the week (title + link), titles only — never post text.
  - A closing line with the sign-up link `https://lp9ypc.vercel.app/register`.
  - WhatsApp formatting (`*bold*`), under ~3,500 characters, a live character count, a "Copy" button, and a plain-English note: "Victor approves the text before it goes to the WhatsApp groups."
  - Optional: a "parish" field that appends `?src=<slug>` to the links (slug-safe, ≤40 chars) — attribution only, nothing stored yet.
- Overview: a "Weekly applying members" tile row from `apply_weekly(8)` — this week's number, last week's, and a small 8-week sparkline (inline SVG, no chart library), plus member and visitor taps this week. Hide it gracefully if the function is missing.
- Jobs tab: show a job's total Apply taps if cheap (optional; skip if it needs a new function).
