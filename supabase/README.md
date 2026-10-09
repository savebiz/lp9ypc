# Supabase setup — LP9 YPC

This folder is the database schema's permanent home. The original project
behind the live site no longer exists, and its schema was never saved.

| File | What it is |
|---|---|
| `migrations/20261008120000_initial_schema.sql` | Phase 1: profiles, career paths, jobs, saved jobs, announcements; RLS; signup trigger; the 10 career paths |
| `migrations/20261009120000_community_agents.sql` | Phase 2: career goal, AI-agent tables, job sources + review queue, News & events fields, communities, discussion board, reports, moderation and agent logs; 17 starter communities |
| `verify.sql` | 27 read-only checks to run after both migrations. Every row should say `true`. |
| `../.env.example` | Every environment variable the app reads |

**Status:** reviewed line by line against every database call in `src/`.
**Not yet executed against a real database.** Your first run, in a fresh
project, is the first execution. Both files are safe to re-run, so if
anything errors, send me the message and I'll fix it.

> ⚠️ **Use a NEW, EMPTY Supabase project dedicated to LP9 YPC.**
> Never run these migrations in a project that hosts another app.
> On 2026-10-09 the key first supplied turned out to belong to a project
> hosting a different live app with its own `profiles` table. Running these
> migrations there would break that app's sign-ups. Nothing was written to it.

---

## Steps (about 20 minutes, all in your own accounts)

### 1. Create the project
supabase.com/dashboard → **New project**
- **Name:** `lp9-ypc`
- **Database password:** use the generator and keep it in your password
  manager. The app never needs it.
- **Region:** whichever offered region is closest to Lagos. West EU (London)
  or Central EU (Frankfurt) usually have the lowest latency.
- **Plan:** see "Free-tier pausing" at the end.

### 2. Run the schema (in this order)
**SQL Editor → New query**:
1. Paste all of `migrations/20261008120000_initial_schema.sql` → **Run**.
2. New query: paste all of `migrations/20261009120000_community_agents.sql` → **Run**.

Each should say "Success. No rows returned."

### 3. Verify
New query → paste `verify.sql` → **Run**. All 27 rows should say `true`.
Check 15 becomes `false` once you make yourself an admin (step 7); that's
expected.

### 4. Auth settings
**Authentication → URL Configuration**
- **Site URL:** `https://lp-9-ypc-community-platform.vercel.app`
- **Redirect URLs:** add `https://lp-9-ypc-community-platform.vercel.app/**`
  and `http://localhost:3000/**`. Confirmation and password-reset links come
  back to `/auth/callback`.

**Authentication → Sign In / Providers → Email**
- **Confirm email: ON** (the default). The register page shows "Check your
  email", and the link signs the member in on their dashboard. Career-path
  picks and the career goal are saved at signup by the database trigger.
- **Minimum password length: 8**, to match the form.

### 5. Get a Gemini API key (for the AI assistants)
aistudio.google.com → **Get API key** → create it in a Google Cloud project
with **billing enabled**.
- **Why billing matters:** on Google's free tier, prompts and responses may
  be used to improve Google's products and read by human reviewers, and
  Google says not to send personal information there. Member posts are
  personal, so use the paid tier, where Google says it doesn't use them that
  way. The app can't detect which tier a key is on, so this is on you.
- The default model is `gemini-3.8-flash`. Override it with `GEMINI_MODEL`
  if Google retires that name.
- Without a key, everything still works: posts are published and queued for
  human review, and the jobs and career assistants show "not configured".

### 6. Connect the app (environment variables)
From **Project Settings → API Keys**, plus Gemini and a random secret:

| Variable | Where it comes from | Exposed to browsers? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon public" (legacy) or "publishable" key | yes (public by design; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" / secret key | **NO — server only** |
| `GEMINI_API_KEY` | Google AI Studio (billing-enabled project) | **NO — server only** |
| `GEMINI_MODEL` | optional, e.g. `gemini-3.8-flash` | no |
| `CRON_SECRET` | any random string of 32+ characters | **NO — server only** |

- **Never** give the service-role key, the Gemini key or the cron secret a
  `NEXT_PUBLIC_` prefix, and never paste them into chats or tickets. The
  service-role key bypasses every security rule. The app uses it only inside
  server routes, after checking who the caller is.
- **Local:** copy `.env.example` to `.env.local` and fill it in. `.env.local`
  is git-ignored.
- **Production:** Vercel → project → Settings → Environment Variables → add
  all six → redeploy. This is a production change, so it's yours to make.

### 7. Make yourself an admin
Nobody can become an admin from the app, by design. Register on the site with
your own email, then run this in the SQL Editor, with your email in place of
the placeholder:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Repeat for each coordinator. Community managers are assigned in the app
(Admin → Communities), not in SQL.

### 8. Scheduled assistants (Vercel Cron)
`vercel.json` schedules three daily jobs. Vercel sends `CRON_SECRET`
automatically:

| Job | Time (UTC) | What it does |
|---|---|---|
| `/api/cron/career-research` | 03:00 | Researches career paths for up to 5 professions (Google Search grounding) and writes suggestions to members' dashboards |
| `/api/cron/moderation-sweep` | 04:00 | Re-checks posts published while the moderation assistant was unavailable |
| `/api/cron/job-scraper` | 06:00 | Reads up to 3 job sources and adds the jobs it finds to **Admin → Review queue** (nothing goes live without approval) |

On Vercel's Hobby plan, crons run at most once a day; Pro allows more often.
Admins can also press **Run now** on a job source.

---

## End-to-end check (once steps 1–7 are done; run on `localhost:3000` with test accounts)

1. Register test account A: answer "Switch to a new field", pick a path.
   Confirm the email.
   → Dashboard shows suggestions "Based on your profession" and a link to
   communities.
2. Promote account B to admin (step 7). In **Admin → Communities**, make B a
   manager of "YPC Lounge".
3. As A: join YPC Lounge and post a normal thread → it appears ("Posted").
4. As A: post "Call 08030000000 to pay the ₦5,000 registration fee" → "Held
   for review".
5. As B: open YPC Lounge → **Manage** → the held post shows the assistant's
   reason → **Restore** or **Remove**. Check the action appears under
   "Recent actions".
6. As A: report another post → it appears in B's queue → **Resolve**.
7. As admin: **Admin → Job sources** → add a careers page you're allowed to
   read → **Run now** → the found jobs appear in **Review queue** → approve
   one → it shows on `/jobs` with Apply opening the original posting.
8. As admin: post a Parish event with a future date → it shows under
   `/news?scope=parish`.
9. Cron auth: `curl -i http://localhost:3000/api/cron/job-scraper` → 401;
   then with `-H "Authorization: Bearer $CRON_SECRET"` → 200 and a new row in
   Admin → Agents.

## What the security model guarantees

- **Visitors** read career paths, approved jobs, announcements, the
  community directory and its counts. Nothing about members.
- **Members** read and edit only their own profile, saved jobs, career paths
  and suggestions. They can't change their own role or email (column
  privileges).
- **Signup** creates the profile in the database and ignores any `role` in
  the signup data.
- **Discussion posts** can't be written directly by anyone's browser. Every
  post goes through a server route that checks the session, membership,
  locks and a rate limit (10 posts per 10 minutes, enforced inside the
  database so parallel requests can't slip past it), runs moderation, and
  only then publishes the post.
- **Moderation notes stay private.** Why a post was held, and whether the
  assistant or a person held it, is hidden from members by column
  privileges; managers read it through `post_moderation_notes()`, which only
  answers for communities they moderate.
- **Reports can't be edited by members** once filed, and replies inside a
  held or removed discussion are hidden along with it.
- **Other members see only "First L."** on posts, never profiles or contact
  details.
- **Managers** moderate only their own community; admins moderate everywhere.
  Every action is logged. A manager can't approve their own held post;
  another manager or an admin has to.
- **The AI assistants only propose.** Scraped jobs wait for approval; new
  career paths wait for approval; held posts wait for a human.
- **Every job's Apply link must be `http(s)`**, and scraped Apply links must
  appear on the source page itself.
- **No one can bulk-wipe a table from the app** (TRUNCATE revoked).
- **Deleting a member** happens only in the Supabase dashboard
  (Authentication → Users). It cascades to their profile, posts, saved jobs
  and paths.

## Free-tier pausing

Supabase pauses free-tier projects after roughly a week with no activity,
and the site's data then stops loading. For a live member platform, either
use a paid plan or set a reminder to press "Restore project". Whether to pay
is your call.
