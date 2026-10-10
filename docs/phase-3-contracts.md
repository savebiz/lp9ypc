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
