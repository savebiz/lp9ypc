# Supabase setup — LP9 YPC

The original Supabase project behind the live site no longer exists (its
hostname doesn't resolve), and its schema was never saved anywhere. This
folder is the schema's permanent home from now on.

| File | What it is |
|---|---|
| `migrations/20261008120000_initial_schema.sql` | Every table, index, trigger, security policy and privilege the app needs, plus the 10 career paths from the brief. Safe to re-run. |
| `verify.sql` | Read-only checks to run afterwards. Every row should say `true`. |
| `../.env.example` | The two environment variables the app reads. |

**Status:** written and reviewed line by line against every database call in
`src/`. **Not yet executed against a real database** — there's no Postgres
or Docker on the dev machine, and installing a local Postgres would mean
running third-party software. Your first run in a fresh, empty project is
the first execution; if anything errors, send the message over and it gets
fixed before anything else.

---

## Steps (about 15 minutes, all in your own Supabase account)

### 1. Create the project
supabase.com/dashboard → **New project**
- **Name:** `lp9-ypc`
- **Database password:** use the generator, store it in your password
  manager. The app never needs it.
- **Region:** the one closest to Lagos that's offered — West EU (London) or
  Central EU (Frankfurt) are typically the lowest-latency options.
- **Plan:** see the note on free-tier pausing at the end.

### 2. Run the schema
**SQL Editor → New query** → paste the whole of
`migrations/20261008120000_initial_schema.sql` → **Run**.
Expect "Success. No rows returned."

### 3. Verify
New query → paste `verify.sql` → **Run**. All 15 rows should say `true`.

### 4. Auth settings
**Authentication → URL Configuration**
- **Site URL:** `https://lp-9-ypc-community-platform.vercel.app`
- **Redirect URLs:** add `http://localhost:3000/**`

**Authentication → Sign In / Providers → Email** — one decision needed:
**"Confirm email"** (on by default).
- **On (recommended — security first):** only real, reachable emails get
  accounts. But today's register page assumes it gets a session straight
  away, so with this on, a new member sees "You're a YPC member", gets sent
  to the login page, and their career-path picks don't save until they log
  in. The schema already supports the fix (the form passes the picks in
  signup metadata and the signup trigger saves them); the form change
  belongs in the registration ticket.
- **Off:** the current form works end to end today, but anyone can sign up
  with an email they don't own.

### 5. Connect the app
**Project Settings → API Keys.** You need two values:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **The public browser key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Supabase
  labels this "anon public" (under legacy keys) or "publishable". It's
  designed to be public; the security rules above are what protect the data.

**Never** use the `service_role` / secret key in this app. It bypasses every
security rule in the migration.

- **Local development:** copy `.env.example` to `.env.local` and fill in both
  values. `.env.local` is already git-ignored.
- **Production:** Vercel → project → Settings → Environment Variables →
  replace both values → redeploy. This is a production change, so it's
  yours to make.

### 6. Make yourself an admin
Nobody can become an admin from the app, by design. Register on the site
with your own email (after step 5), then in the SQL Editor run, with your
real email in place of the placeholder:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Repeat for each coordinator who'll post jobs. To remove someone's admin
access, run the same statement with `'member'`.

---

## What the security model guarantees

- **Visitors** read career paths, active jobs and active announcements.
  Nothing else — they cannot see a single member record.
- **Members** read and edit only their own profile, saved jobs and career
  paths. They **cannot change their own role or email**. That's enforced by
  column privileges, so it holds even if the app code is wrong.
- **Signup** creates the profile in the database itself and **ignores any
  `role` sent in signup data**, so nobody can register as an admin.
- **Admins** manage jobs, announcements and career paths, and read member
  profiles for the dashboard and CSV export.
- **Every job needs an `http(s)` Apply link** at the database level. Jobs
  can't be saved without one, and `javascript:` links are rejected.
- **No one can bulk-wipe a table from the app** (TRUNCATE revoked).
- **Deleting a member** is done only in the Supabase dashboard
  (Authentication → Users), which removes their profile, saved jobs and
  career paths with it. That's a human decision, per CLAUDE.md.

## Known gaps (code side — for the registration ticket, not this one)

- The register page **hard-codes `consent_updates: true`**. The database
  stores whatever it's sent, so consent is still recorded as given without
  being asked. Fixed by adding a real consent checkbox.
- Employment status and preferred work mode aren't on the signup form yet.
  The trigger already accepts both.

## Free-tier pausing

Supabase pauses free-tier projects after roughly a week without activity,
and a paused project means the site's data stops loading. For a live member
platform, either use a paid plan or put a calendar reminder on the
dashboard's "Restore project" button. Whether to pay is your call.
