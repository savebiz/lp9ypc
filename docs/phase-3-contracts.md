# Phase 3 contracts — branding, community social, instant posting, jobs, admin

Plan: `C:\Users\hp\.claude\plans\modular-twirling-charm.md`. Phase 2 contracts (`docs/phase-2-contracts.md`) still apply unless changed here.

Live stack: https://lp9ypc.vercel.app · Supabase `jdkxmtyefskavdfjiftb` · Gemini (key currently WITHOUT billing: grounding → 429).

## Database (migration `supabase/migrations/20261010120000_community_social.sql`, by tech lead)

- `threads`: `like_count int`, `edited_at timestamptz|null`.
- `replies`: `parent_id uuid|null` (same thread, enforced), `depth 0..2` (set by trigger; a reply to a depth-2 reply is re-parented to keep depth 2), `like_count`, `edited_at`.
- `post_likes (member_id, target_type 'thread'|'reply', target_id, community_id, created_at)`, PK (member_id, target_type, target_id).
  - Browser writes directly with the session client: `insert {member_id: me, target_type, target_id}` / `delete ... eq(member_id, me)`. `community_id` and `created_at` are set by the database; never send them.
  - RLS allows a like only on a **visible** post (and visible parent thread) in a community the member belongs to. Unlike is always allowed.
  - `like_count` is updated by trigger; re-read it or update optimistically.
- Types: `Thread`, `Reply`, `PostLike` in `src/types/index.ts` (already updated).
- Column lists that select posts MUST add the new columns: threads `like_count, edited_at`; replies `parent_id, depth, like_count, edited_at`. Never `select("*")` on posts (moderation columns are not granted).

## Instant posting (pre-moderation kept)

Flow for create, reply and edit:
1. Route validates (session, origin, membership, lock, length) exactly as today.
2. `claimPostSlot` (create/reply) inserts `pending`; for edit the route updates `title/body`, sets `edited_at = now()`, `status = 'pending'`, `needs_review = false` with the admin client (own post only, not removed/held-by-human).
3. `checkLocalRules` (sync, no network). If it holds → update to `held` immediately and log, respond `201 {ok, id, status: "held", message}`.
4. Otherwise respond **immediately** `201 {ok, id, status: "pending", message: "Posted. We're doing a quick check before others can see it."}` and schedule the AI check with `schedulePostModeration(...)`.

**Owned by ai-agents-engineer** — `src/lib/agents/post-moderation-job.ts`:
```ts
export interface PostModerationJob {
  kind: "thread" | "reply";
  id: string;
  communityId: string;
  communityName: string;
  title?: string;           // threads only
  body: string;
}
/** Runs the Gemini check, applies the result to the row, logs it. Never throws. Returns the final status. */
export async function runPostModeration(admin: SupabaseClient, job: PostModerationJob): Promise<"visible" | "held" | "pending">;
/** Calls Next's after() so the check runs after the response is sent. Must be called inside a route handler / server component. */
export function schedulePostModeration(admin: SupabaseClient, job: PostModerationJob): void;
```
- Result mapping is unchanged from Phase 2: allow → `visible`; hold → `held` + reason/categories/`moderated_by='agent'`; AI unavailable → `visible` + `needs_review = true` (fail-open with review, as approved in Phase 2).
- Only update the row if it is still `pending` (`.eq("status","pending")`), so a manager action in between wins.
- Logging moves here (same `moderation_log` rows as today's `logPostModeration`).
- Retry 429/503 with backoff inside a ~25 s budget; `GEMINI_FALLBACK_MODEL` env (optional) tried once if the primary is overloaded. Moderation `maxOutputTokens` 512.
- Routes set `export const maxDuration = 60`.

**Author's view (community-engineer):** show the new post immediately with a "Checking…" chip; poll the post's `status` with the browser Supabase client (authors can read their own pending rows) every 2 s for up to 30 s; then "Still checking — it'll appear for others soon." Held → show the Phase 2 author note.

**Stale safety net (community-engineer, thread page):** for at most 3 posts in the thread that are `pending` and older than 2 minutes, call `schedulePostModeration` (server side, admin client).

## Community API (owned by community-engineer)

- `POST /api/community/threads` `{communityId, title, body}` → as above.
- `POST /api/community/replies` `{threadId, body, parentId?}` → `parentId` must be a reply in the same thread (the DB re-checks). Set it with the admin client right after `claimPostSlot` (before scheduling moderation).
- `PATCH /api/community/posts` `{targetType: "thread"|"reply", targetId, title?, body}` → edit own post; `200 {ok, id, status: "pending"|"held", message}`. Rate limit: reuse `claim_post_slot`? No — edits don't create rows; allow at most 1 edit per post per 30 s (check `edited_at`).
- `POST /api/community/moderate` unchanged (`delete_own` for deleting your own post).
- Likes: no route (direct, RLS).
- Share: client only (`navigator.share`, fallback copy link). URL `https://<origin>/community/<slug>/t/<id>`. Signed-out visitors on a thread URL see a sign-in / join prompt (no content).

## Job finder (owned by ai-agents-engineer)

- New `src/lib/agents/structured-jobs.ts`: extract schema.org `JobPosting` from JSON-LD (`<script type="application/ld+json">`, incl. `@graph` and arrays) and from RSS/Atom feeds. Map to the same shape `validateExtractedJobs` accepts. The Apply link must still be among the page's links OR be the posting's own `url`/`applicationUrl` on the same site. Unit tests with fixtures.
- `job-scraper.ts`: structured data first; AI only if none found; AI input trimmed to ~12k chars of main content.
- Plain-English status in `job_sources.last_error` (and `last_status`): use exactly these sentences so Admin can show them:
  - `"Blocked by the site's robots.txt, so we can't read it."` (status `blocked`)
  - `"No job listings found on this page."` (status `empty`)
  - `"The AI service is busy right now. We'll try again on the next run."` (503 / timeout)
  - `"Gemini needs billing turned on for this key (quota exceeded)."` (429)
  - `"Couldn't open the page (it may be down or blocking us)."` (fetch errors)
- `src/lib/agents/suggested-sources.ts`: `export const SUGGESTED_SOURCES: { name: string; url: string; why: string; method: "structured" | "ai" }[]` — 6–8 reputable Nigerian/remote job pages, each checked: robots.txt allows the path, page loads, and whether it has JobPosting data. Nothing is inserted; Admin shows them with an "Add this source" button.

## Admin (owned by fullstack-admin-engineer)

- Owns `src/app/admin/**`, `src/app/api/admin/**` EXCEPT `src/app/api/admin/job-sources/[id]/run` (ai-agents-engineer), plus `src/app/dashboard/**`, `src/app/jobs/**` loading skeletons only.
- New `POST /api/admin/members/role` `{memberId, role: "admin"|"member"}`: `requireAdmin` + service role; refuse demoting the last admin; log to console only (no member data in logs). Confirm dialog in UI.
- Job sources tab: show plain-English `last_error`; "Suggested sources" list from `SUGGESTED_SOURCES` with "Add this source".
- Thread/reply column constants in `src/app/admin/page.tsx` gain the Phase 3 columns.

## Branding (owned by brand-creative-director)

- Owns `src/components/layout/**`, `src/components/ui/YPCMark.tsx`, `src/app/page.tsx`, `src/app/about/**`, `src/app/globals.css` (sole editor), `public/**`, `src/app/icon.*`, `src/app/apple-icon.*`, `src/app/opengraph-image.*`, `src/app/layout.tsx` metadata only.
- Assets: `public/branding/ypc-logo.png` (official YPC logo, 914×322, transparent), `public/branding/lp9-yaya-logo.png` (Victor's LP9 YAYA logo, 500×500), `public/branding/LP9_YAYA_Logo-bg.png`, `public/yaya-crest.png`.

## Everyone

- Read `CLAUDE.md` (brain repo) and your skills first. Calm Kinetic tokens; mobile-first (375px); 44px tap targets; WCAG AA; honest copy.
- Edit only files you own. No new dependencies, no `npm install`, no `next build`, no git. Verify with `npx tsc --noEmit` and fix errors in your files.
- Report: files changed, what's done/not done, anything the tech lead must wire.

---

# Phase 3.1 addendum (2026-10-10): reply targets, admin audit, event flyers, local AI helper

Migration `supabase/migrations/20261011120000_replyto_audit_flyers.sql` (tech lead; Victor applies it).

- **`replies.reply_to_id`**: set automatically by the `replies_set_depth` trigger to the parent the member actually replied to, BEFORE re-parenting. Routes don't need to set it. Readable column. UI: show "Replying to {Name}" when `reply_to_id` is set and differs from `parent_id` (community-engineer). Add it to `REPLY_COLUMNS` and admin reply column lists.
- **`admin_audit (id, actor_id, action, target_type, target_id, details jsonb, created_at)`**: admins can read; ONLY server routes write it, with the service role. Helper (fullstack-admin-engineer) `src/app/api/_lib/audit.ts`: `export async function writeAudit(admin, { actorId, action, targetType?, targetId?, details? }): Promise<void>` that never throws (logs a code on failure). Actions to record now: `member.role_change` (details `{from, to}`), `job_source.run` (manual Run now). Never put member contact details in `details`.
- **Event flyers**: `announcements.image_url` (must start `https://`; the public URL from the `event-flyers` bucket) and `image_alt` (≤300 chars, required in the UI when a flyer is attached). Bucket `event-flyers`: public read, admins-only write (RLS on storage.objects), 5 MB, jpeg/png/webp. Upload path: `flyers/{yyyy}/{uuid}.{ext}`.
- **Local AI helper** (ai-agents-engineer): see the brief in your task message.


---

# Phase 3.2 addendum (2026-10-12): member feedback + assistant link checks

Victor's decisions: **members only** (no visitors), **no public ideas board yet**, **daily link/date checker: yes, flag only** (never hides or edits anything). Migration `supabase/migrations/20261012120000_feedback.sql` (tech lead; Victor applies it — it may not be live when you test: code to the contract and handle a missing table with a friendly error).

## Database
- `feedback`: `source` member|assistant · `kind` link|wrong_info|broken|idea · `message` ≤400 (idea needs ≥3) · `page_path` same-site path only (starts `/`, not `//`, no spaces, ≤300) · `target_type` job|announcement|career_path|community + `target_id` · `submitter_id` (null for assistant) · `status` new|looking|fixed|not_now · `admin_note` ≤1000 (INTERNAL) · `public_reason` ≤200 (shown to the sender) · `handled_by/handled_at` · timestamps.
  - RLS: admins read. NO browser inserts or updates. Member submits go through `submit_feedback()` (server, service role); admin updates through the admin route (service role + `writeAudit`); the assistant inserts with the service role.
  - Unique partial index: one OPEN assistant item per (target_type, target_id, kind).
- `my_feedback` view: a member's own rows (no admin_note). The dashboard reads it with the session client.
- `submit_feedback(p_submitter, p_kind, p_message, p_page_path, p_target_type, p_target_id, p_limit=5, p_window='10 minutes') → uuid`: NULL = rate-limited (429); returns the existing id if the same member already has an open report of that kind on that item within 24 h. Callable only by service_role.
- `link_health (job_id pk, fail_count, last_status, last_http, checked_at)`: admins read; the checker writes with the service role.
- `agent_runs.agent` now also accepts `'link_check'`.
- Types `Feedback`, `MyFeedback`, `FeedbackKind/Status/TargetType`, `LinkHealth` are in `src/types/index.ts`.

## Wording (use exactly)
- Kind labels: link → "This link doesn't work" · wrong_info → "Something here is wrong" · broken → "Something's broken" · idea → "I have an idea".
- Status labels: new → "Received" (admin list: "New") · looking → "Looking into it" · fixed → "Fixed" · not_now → "Not now".
- Footer link: "Spotted a problem or have an idea? Tell us." Job: "Link not working?" Event: "Wrong details?"
- Form hint: "Wrong details, a link that doesn't work, or an idea to make this better. To report a person or a post, use Report instead."
- Thank-you: "Thank you, that really helps. Someone from the YPC team will read it within 3 days. You can see its progress on your dashboard."
- Assistant messages: link — "The Apply link didn't open on 2 checks in a row ({reason})."; wrong_info — "This event's date has passed but it's still showing." / "The closing date has passed but the job is still showing."

## Member side (builder A)
Files: `src/app/api/feedback/**`, `src/app/feedback/**`, `src/components/feedback/**`, `src/components/jobs/JobCard.tsx` and `src/app/jobs/[id]/page.tsx` (add the link only), `src/components/news/EventCard.tsx`, `src/components/layout/Footer.tsx`, `src/app/dashboard/page.tsx` (plus a new FeedbackPanel component), `src/app/privacy/page.tsx`.
- `POST /api/feedback` `{kind, message?, pagePath?, targetType?, targetId?, website?}` (`website` is a honeypot: if filled, return 201 and store nothing). Order: `checkOrigin` → `requireUser` → `requireServiceRole` → `parseBody` → validate (kind enum; message ≤400; `pagePath` must be a same-site path: `new URL(x, "https://x.invalid")`, origin must match, keep pathname+search ≤300, reject `//`; the target must exist: look it up with the session client) → if `checkLocalRules(message)` hits, return 201 and store nothing (don't tip off spammers) → `rpc("submit_feedback")` with the admin client → `201 {ok:true, id}`; NULL → 429 "You've sent a few already. Please wait a few minutes and try again." No AI call.
- `/feedback` page: signed out → sign-in prompt plus "or email {SITE.contactEmail}". Signed in → form: required kind (large option rows), optional note (counter, 400), "About: {item title}" when `?job=<id>`, `?event=<id>` or `?path=<id>` is present (title looked up server-side), `?kind=` preselects, hidden honeypot. After submit: inline thank-you and a back link. Mobile-first, 44px targets, no CAPTCHA.
- Entry points: JobCard and job detail: small muted text link under Apply, "Link not working?" → `/feedback?job=<id>&kind=link` (must not compete with the citrus Apply button). EventCard: "Wrong details?" → `/feedback?event=<id>&kind=wrong_info`. Footer: "Spotted a problem or have an idea? Tell us." → `/feedback`.
- Dashboard: "Your feedback" panel from `my_feedback` (latest 5: kind label, short note, status label, `public_reason` when Not now). Hide the panel when empty or when the view is missing.
- Privacy page: add feedback to What we collect (category, note, the page it was about, your account), Who can see it (club admins only; never shown publicly), How long we keep it (12 months after it's resolved; removed with your account). Update LAST_UPDATED. No AI sees feedback.

## Admin side (builder B)
Files: `src/app/admin/**`, `src/app/api/admin/feedback/**`.
- `PATCH /api/admin/feedback/[id]` `{status?, adminNote?, publicReason?}`: `requireAdmin` + service role; validate lengths; set `handled_by/handled_at` when status leaves new; `writeAudit` (action "feedback.update", target "feedback", details {status}).
- "Feedback" tab (after Moderation): newest first; filters (status, kind, found by the assistant); each row: kind label and source badge ("Found by the assistant"), the note as plain text (never HTML or linkified), sender's first name, page as an internal `<Link href={page_path}>`, "Fix it now" (job → Jobs editor for that job; announcement → News & events editor), status buttons (Looking into it / Fixed / Not now + one-line reason shown to the sender), internal note box, "{n} reports" when several members reported the same item.
- Overview "Needs your attention": new feedback count; jobs with ≥2 open "link" reports first. Load `feedback` and `link_health` in `page.tsx`; if the tables are missing, hide these parts.
- Assistants tab run log: label `link_check` as "Link checker".

## Link checker (builder C)
Files: `src/lib/agents/link-check.ts`, `src/app/api/cron/link-check/route.ts`, `tests/agents/link-check.test.ts` (`vercel.json` already schedules 05:00 UTC).
- `GET /api/cron/link-check`: `checkCron`, `maxDuration = 60`, one `agent_runs` row (agent `link_check`, trigger cron).
- Active, approved jobs not checked in the last 20 h (oldest first, ≤40 per run, ≤4 at once, 8 s each): fetch the Apply link with the SSRF-safe fetch (HEAD, falling back to GET; ≤3 redirects; bot user agent; robots.txt not required for a single link check). Classify: ok (2xx/3xx ending on a real page); not_found (404/410); redirect_home (ends on the site root when the original link had a path); timeout / blocked / error (5xx, 403/429, network) — record `last_status` but do NOT count these as failures (flaky sites). Increment `fail_count` only on not_found/redirect_home; reset to 0 on ok.
- When `fail_count` reaches 2, insert a `feedback` row (source assistant, kind link, target job, page_path `/jobs/{id}`, message as worded above) unless an open one exists (ignore the unique-index conflict). Each run also files one open wrong_info item for: active jobs whose `deadline` (Lagos date) has passed; active events whose `coalesce(ends_at, starts_at)` is more than 24 h ago. Never modify jobs or announcements.
- Tests (pure functions, injected fetch and clock): classification, 403/5xx don't count, the two-strike rule, no duplicate items, deadline and event rules.
