# Phase 2 contracts

Shared agreements between the parallel builders. Data model:
`supabase/migrations/20261009120000_community_agents.sql`. Types: `src/types/index.ts`.
If you need to change a contract, say so in your report — don't silently diverge.

## File ownership

| Owner | Files |
|---|---|
| tech lead | `supabase/**`, `src/types/**`, `src/lib/supabase/**`, `src/lib/profession.ts`, `src/components/layout/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/about/**`, `next.config.ts`, `package.json`, `docs/**` |
| ai-agents-engineer | `src/lib/agents/**`, `src/app/api/**`, `vercel.json`, `tests/agents/**`, `tsconfig.json` (only to enable `allowImportingTsExtensions` for tests) |
| community-engineer | `src/app/community/**`, `src/components/community/**` |
| member-admin-engineer | `src/app/register/**`, `src/app/dashboard/**`, `src/app/admin/**`, `src/lib/career-match.ts`, `src/components/career/**`, `tests/career/**` |
| trust-portals-engineer | `src/app/news/**`, `src/app/privacy/**`, `src/app/guidelines/**`, `src/components/news/**` |

## API routes (built by ai-agents-engineer, called by the UI builders)

All POST routes:
- Accept `Content-Type: application/json` only.
- Reject requests whose `Origin` header is not this site's origin with **403**.
- Identify the caller with the session client (`auth.getUser()`).
- Respond JSON: `{ ok: true, ... }` on success, or `{ ok: false, error: string }` with a friendly, member-safe message.

| Status | Meaning |
|---|---|
| 400 | Invalid input (lengths, missing fields) |
| 401 | Not signed in |
| 403 | Not a member, not a moderator, thread locked, or bad origin |
| 404 | Not found |
| 429 | Rate limited: more than 10 posts (threads + replies) in 10 minutes |
| 503 | Service role key not configured |

### `POST /api/community/threads`
Request: `{ communityId: string, title: string (3–160), body: string (1–5000) }`
Response 201: `{ ok: true, id: string, status: "visible" | "held", message: string }`
- `message` is shown to the author, e.g. "Posted." or "Held for review — a community manager will check it soon."
- Requires membership of an active community.

### `POST /api/community/replies`
Request: `{ threadId: string, body: string (1–3000) }`
Response 201: `{ ok: true, id, status: "visible" | "held", message }`
- Requires membership; the thread must be visible (or the caller a moderator) and not locked.

### `POST /api/community/moderate`
Request: `{ action, targetType?: "thread"|"reply", targetId?: string, reportId?: string, reason?: string (≤ 500) }`

| `action` | Who may call it | Effect |
|---|---|---|
| `restore` | moderator (`can_moderate`) | status → `visible` |
| `hold` | moderator | status → `held` |
| `remove` | moderator | status → `removed` |
| `pin` / `unpin` | moderator, threads only | `is_pinned` |
| `lock` / `unlock` | moderator, threads only | `is_locked` |
| `delete_own` | the post's author | status → `removed` |
| `report_resolve` / `report_dismiss` | moderator of the report's community | report status; needs `reportId` |

Response: `{ ok: true }`. Every action writes `moderation_log` (`actor_type: "human"`).

### `POST /api/admin/job-sources/[id]/run` (admins only)
Response: `{ ok: true, status: "ok"|"empty"|"blocked"|"error", found: number, inserted: number, message: string }`

### `GET /api/admin/agents/status` (admins only)
Response: `{ ok: true, anthropic: boolean, serviceRole: boolean, cronSecret: boolean }`
- Booleans only, never values.

### Crons (`GET`, `Authorization: Bearer $CRON_SECRET`)
- `/api/cron/job-scraper` (daily 06:00 UTC)
- `/api/cron/career-research` (daily 03:00 UTC)
- `/api/cron/moderation-sweep` (daily 04:00 UTC)

## Direct-from-browser operations (RLS allows them; no route needed)

- **Join a community:** `insert community_members { community_id, member_id: user.id }`. **Leave:** `delete … where community_id and member_id = user.id`.
- **Report:** `insert reports { community_id, target_type, target_id, reporter_id: user.id, reason }`. The trigger replaces `community_id`.
  - A duplicate report (unique violation, code `23505`) means "you already reported this".
- **Career suggestions:**
  - Accept: `update career_path_suggestions set status='added'`, then `insert member_career_paths { member_id, career_path_id }` (ignore `23505`).
  - Dismiss: `status='dismissed'`.
- **Admin CRUD** (admins only by RLS):
  - `job_sources`, `communities`;
  - manager assignment (`community_members` insert or `update role`);
  - job review (`update jobs set review_status='approved', is_active=true` or `review_status='rejected', is_active=false`);
  - `career_path_candidates` (`update status, reviewed_by, reviewed_at`; on approve also `insert career_paths { name, slug }`);
  - `announcements`, including the Phase 2 fields.
- **Profile:** `update profiles set career_goal`.

## Read patterns

- **Community directory:** `communities` (active) + `community_overview` (counts; also visible to visitors).
- **Author names:** `member_directory.select("id, display_name").in("id", authorIds)`. Members only.
- **Is the viewer a moderator here?** Admin from `getSession().isAdmin`, or a `community_members` row with `role='manager'` for the viewer.
- **Thread list:** `threads … eq(community_id) order(is_pinned desc).order(last_activity_at desc)`. RLS already limits rows to visible + own + moderator.
- **News portal:** `announcements` where `is_active`, filtered by `scope`. Events are `kind='event'`; upcoming = `starts_at >= now()`, sorted ascending.

## Moderation agent function (ai-agents-engineer exports, routes use)

`src/lib/agents/moderation.ts`:
```ts
export async function moderatePost(input: {
  kind: "thread" | "reply"; title?: string; body: string; communityName: string;
}): Promise<{ decision: "allow" | "hold"; categories: string[]; reason: string; source: "agent" | "unavailable" }>
```
`source: "unavailable"` means the agent couldn't decide. The route then publishes with `needs_review = true`.

## Career keyword matcher (member-admin-engineer exports)

`src/lib/career-match.ts`, pure, no network:
```ts
export function suggestPathSlugs(profession: string): string[]  // best-first slugs from the 10 career paths
```
Uses `normalizeProfession` from `src/lib/profession.ts`.
