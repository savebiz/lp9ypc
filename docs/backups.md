# Database backups (Victor runs these)

The club's data lives in Supabase. On the free plan Supabase keeps **no
backups we can restore from**, so until we move to Supabase Pro, Victor takes
a weekly copy himself. Exporting member data is Victor's decision: nobody
automates this, and the tech team never runs it for him.

## What the backup contains

`scripts/backup-db.ts` saves **one JSON file** with every row of every LP9
table: career paths, member profiles (names, phones, emails, areas,
professions), members' career paths, saved jobs, jobs, job sources,
announcements, career research and suggestions, communities and their
members, discussions, replies, likes, reports, the moderation log, assistant
runs, the admin activity log, feedback and Apply-link checks.

It does **not** contain:
- sign-in accounts and passwords (Supabase Auth keeps these; nobody can
  export passwords). Each profile row has the member's id and email, which is
  enough to invite people back if accounts were ever lost;
- event flyer images (Supabase Storage, bucket `event-flyers`). They are
  public pictures and can be uploaded again.

## How to run it (weekly, about 1 minute)

1. Plug in your **encrypted** drive (for example a USB drive with BitLocker
   To Go turned on) and make a folder on it, e.g. `E:\LP9 backups`.
2. Open a terminal in the project folder (the one with `package.json`).
3. Run:

   ```
   npm run db:backup -- "E:\LP9 backups"
   ```

4. It prints each table with its number of rows, then the file it saved,
   e.g. `lp9ypc-backup-2026-10-23-1530.json`. Nothing else is printed: no keys,
   no member details.

The script uses the keys already in `.env.local` on your PC. It will refuse to
save:
- inside **OneDrive** (OneDrive copies files to the cloud, and this is the
  company OneDrive), or
- inside the project folder (where a file could be shared or committed by
  mistake).

If any table can't be read, it stops and saves nothing, so you never keep a
half backup without knowing.

## Where to keep the file

- On the **encrypted drive**, or as an attachment in your **password
  manager**'s secure storage. Nowhere else.
- Never email it, send it on WhatsApp, or upload it to Google Drive,
  OneDrive or Dropbox. It holds members' personal data (Nigeria Data
  Protection Act 2023).
- Keep the last **4 weekly files**. Delete older ones (empty the Recycle Bin
  too).

## How to restore

Restoring is a job for the tech lead, with Victor's go-ahead, because it
overwrites live data. In outline:

1. Pick the newest good backup file.
2. If the Supabase project itself was lost: create a new project, apply every
   file in `supabase/migrations/` in order, and run `supabase/verify.sql`.
3. Member profiles are linked to sign-in accounts. Accounts that still exist
   keep working. If accounts were lost too, the tech lead recreates each one
   first with the Supabase Auth admin API, using the same id and email as the
   profile row; members then use "Forgotten your password?" to set a new one.
4. Insert the tables in the order listed in the file's `table_order`
   (parents before children), using the service-role key from a one-off
   script the tech lead writes and reviews. Rows in `replies` are already in
   date order, so a reply always comes after the one it answers.
5. Run `supabase/verify.sql` again and spot-check the admin dashboard.

## When this stops being needed

Once the club passes about **50 members**, move to **Supabase Pro**: it takes
daily backups automatically (7 days kept) and restores from the dashboard.
Then this weekly manual copy can stop, and old backup files should be deleted.
