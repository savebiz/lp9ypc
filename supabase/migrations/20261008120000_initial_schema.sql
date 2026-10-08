-- ============================================================================
-- LP9 YPC Community Platform — initial schema
-- ============================================================================
-- Rebuilds the data layer the app expects (src/types/index.ts and every
-- supabase.from(...) call in src/). The original Supabase project was lost
-- with no schema on record; this file is now the record.
--
-- Safe to re-run: every statement is idempotent, so if a run stops partway
-- you can fix the cause and run the whole file again.
--
-- Security model (summary — details at each section):
--   * Visitors (anon) can read career paths, active jobs, active announcements.
--     Nothing else.
--   * Members (authenticated) can read and edit only their own profile,
--     saved jobs and career paths. They can never change their own role or
--     email.
--   * Admins (profiles.role = 'admin') manage jobs, announcements and career
--     paths and can read all member profiles. Nobody can become admin from
--     the app; promotion is a manual SQL step (see supabase/README.md).
--   * Profiles are created only by the signup trigger, which ignores any
--     role a user tries to smuggle in through signup metadata.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.career_paths (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon        text not null default '' check (char_length(icon) <= 16),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  full_name            text not null default '' check (char_length(full_name) <= 120),
  phone                text check (char_length(phone) <= 32),
  email                text not null default '' check (char_length(email) <= 320),
  area_of_residence    text check (char_length(area_of_residence) <= 120),
  parish_unit          text check (char_length(parish_unit) <= 120),
  profession           text check (char_length(profession) <= 120),
  employment_status    text check (employment_status in ('employed', 'self-employed', 'unemployed', 'student', 'other')),
  preferred_work_mode  text check (preferred_work_mode in ('remote', 'onsite', 'hybrid', 'any')),
  consent_updates      boolean not null default false,
  role                 text not null default 'member' check (role in ('member', 'admin')),
  avatar_url           text check (char_length(avatar_url) <= 500),
  bio                  text check (char_length(bio) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.member_career_paths (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.profiles (id) on delete cascade,
  career_path_id  uuid not null references public.career_paths (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (member_id, career_path_id)
);

create table if not exists public.jobs (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 160),
  company           text not null check (char_length(company) between 1 and 160),
  location          text check (char_length(location) <= 120),
  work_mode         text check (work_mode in ('remote', 'onsite', 'hybrid')),
  engagement_type   text check (engagement_type in ('full-time', 'part-time', 'contract', 'internship', 'graduate-trainee')),
  experience_level  text check (experience_level in ('entry', 'mid', 'senior')),
  deadline          date,
  description       text check (char_length(description) <= 5000),
  career_path_id    uuid references public.career_paths (id) on delete set null,
  -- The one-tap Apply link is the platform's most important interaction.
  -- It must exist, and it must be a web link: this also blocks javascript:
  -- and data: URLs from ever being rendered as an Apply button.
  application_link  text not null,
  salary_range      text check (char_length(salary_range) <= 80),
  is_active         boolean not null default true,
  posted_by         uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint jobs_application_link_http
    check (application_link ~* '^https?://[^[:space:]]+$' and char_length(application_link) <= 2000)
);

create table if not exists public.saved_jobs (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (member_id, job_id)
);

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  content     text check (char_length(content) <= 2000),
  is_active   boolean not null default true,
  posted_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2. Indexes (for the queries the app actually runs)
-- ----------------------------------------------------------------------------

create index if not exists jobs_active_created_idx          on public.jobs (is_active, created_at desc);
create index if not exists jobs_career_path_idx             on public.jobs (career_path_id);
create index if not exists announcements_active_created_idx on public.announcements (is_active, created_at desc);
create index if not exists member_career_paths_path_idx     on public.member_career_paths (career_path_id);
create index if not exists saved_jobs_job_idx               on public.saved_jobs (job_id);
create index if not exists profiles_created_idx             on public.profiles (created_at desc);


-- ----------------------------------------------------------------------------
-- 3. Helper and trigger functions
-- ----------------------------------------------------------------------------

-- True when the signed-in user is an admin. SECURITY DEFINER so policies on
-- profiles can call it without recursing into their own RLS checks.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The admin job form sends '' for any dropdown left on "Select" and for
-- empty text boxes. Turn those into NULL so the CHECK constraints accept
-- them and the data stays clean.
create or replace function public.normalize_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title            := trim(new.title);
  new.company          := trim(new.company);
  new.application_link := trim(new.application_link);
  new.location         := nullif(trim(new.location), '');
  new.work_mode        := nullif(trim(new.work_mode), '');
  new.engagement_type  := nullif(trim(new.engagement_type), '');
  new.experience_level := nullif(trim(new.experience_level), '');
  new.description      := nullif(trim(new.description), '');
  new.salary_range     := nullif(trim(new.salary_range), '');
  return new;
end;
$$;

-- Same for the member profile form (/dashboard/profile).
create or replace function public.normalize_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name           := trim(coalesce(new.full_name, ''));
  new.phone               := nullif(trim(new.phone), '');
  new.area_of_residence   := nullif(trim(new.area_of_residence), '');
  new.parish_unit         := nullif(trim(new.parish_unit), '');
  new.profession          := nullif(trim(new.profession), '');
  new.employment_status   := nullif(trim(new.employment_status), '');
  new.preferred_work_mode := nullif(trim(new.preferred_work_mode), '');
  new.bio                 := nullif(trim(new.bio), '');
  return new;
end;
$$;

-- Creates the member's profile when they sign up.
--
-- Reads the fields the registration form passes as signup metadata. Signup
-- metadata is controlled by whoever calls the signup endpoint, so:
--   * role is NEVER read from it — every new account is a 'member';
--   * every value is trimmed, length-capped and validated, so bad input
--     stores NULL instead of failing the signup.
--
-- Also accepts an optional `career_path_ids` array. The current register
-- page saves career paths with a separate insert after signup, which only
-- works when Supabase hands back a session immediately (email confirmation
-- OFF). Passing the ids in metadata instead works either way; switching the
-- form over is part of the registration ticket.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, email, full_name, phone, area_of_residence, profession,
    employment_status, preferred_work_mode, consent_updates
  )
  values (
    new.id,
    left(coalesce(new.email, ''), 320),
    left(trim(coalesce(meta ->> 'full_name', '')), 120),
    left(nullif(trim(meta ->> 'phone'), ''), 32),
    left(nullif(trim(meta ->> 'area_of_residence'), ''), 120),
    left(nullif(trim(meta ->> 'profession'), ''), 120),
    case when meta ->> 'employment_status' in ('employed', 'self-employed', 'unemployed', 'student', 'other')
         then meta ->> 'employment_status' end,
    case when meta ->> 'preferred_work_mode' in ('remote', 'onsite', 'hybrid', 'any')
         then meta ->> 'preferred_work_mode' end,
    coalesce(meta ->> 'consent_updates' = 'true', false)
  )
  on conflict (id) do nothing;

  if jsonb_typeof(meta -> 'career_path_ids') = 'array' then
    insert into public.member_career_paths (member_id, career_path_id)
    select new.id, cp.id
    from public.career_paths cp
    where cp.id::text in (select jsonb_array_elements_text(meta -> 'career_path_ids'))
    on conflict (member_id, career_path_id) do nothing;
  end if;

  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_normalize on public.profiles;
create trigger profiles_normalize
  before insert or update on public.profiles
  for each row execute function public.normalize_profile();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_normalize on public.jobs;
create trigger jobs_normalize
  before insert or update on public.jobs
  for each row execute function public.normalize_job();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 5. Row-level security
-- ----------------------------------------------------------------------------

alter table public.career_paths        enable row level security;
alter table public.profiles            enable row level security;
alter table public.member_career_paths enable row level security;
alter table public.jobs                enable row level security;
alter table public.saved_jobs          enable row level security;
alter table public.announcements       enable row level security;

-- career_paths: everyone reads; admins manage.
drop policy if exists "career_paths: anyone can read"     on public.career_paths;
drop policy if exists "career_paths: admins can insert"   on public.career_paths;
drop policy if exists "career_paths: admins can update"   on public.career_paths;
drop policy if exists "career_paths: admins can delete"   on public.career_paths;
create policy "career_paths: anyone can read"   on public.career_paths for select to anon, authenticated using (true);
create policy "career_paths: admins can insert" on public.career_paths for insert to authenticated with check ((select public.is_admin()));
create policy "career_paths: admins can update" on public.career_paths for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "career_paths: admins can delete" on public.career_paths for delete to authenticated using ((select public.is_admin()));

-- jobs: everyone reads active jobs; admins read everything and manage.
drop policy if exists "jobs: anyone can read active, admins read all" on public.jobs;
drop policy if exists "jobs: admins can insert"                       on public.jobs;
drop policy if exists "jobs: admins can update"                       on public.jobs;
drop policy if exists "jobs: admins can delete"                       on public.jobs;
create policy "jobs: anyone can read active, admins read all" on public.jobs for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "jobs: admins can insert" on public.jobs for insert to authenticated with check ((select public.is_admin()));
create policy "jobs: admins can update" on public.jobs for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "jobs: admins can delete" on public.jobs for delete to authenticated using ((select public.is_admin()));

-- announcements: same shape as jobs.
drop policy if exists "announcements: anyone can read active, admins read all" on public.announcements;
drop policy if exists "announcements: admins can insert"                       on public.announcements;
drop policy if exists "announcements: admins can update"                       on public.announcements;
drop policy if exists "announcements: admins can delete"                       on public.announcements;
create policy "announcements: anyone can read active, admins read all" on public.announcements for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "announcements: admins can insert" on public.announcements for insert to authenticated with check ((select public.is_admin()));
create policy "announcements: admins can update" on public.announcements for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "announcements: admins can delete" on public.announcements for delete to authenticated using ((select public.is_admin()));

-- profiles: members read and update their own row; admins read all rows.
-- No insert policy (the signup trigger creates rows) and no delete policy
-- (deleting member data is a human-owned action, done in the dashboard).
drop policy if exists "profiles: read own, admins read all" on public.profiles;
drop policy if exists "profiles: update own"                on public.profiles;
create policy "profiles: read own, admins read all" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- saved_jobs: strictly the member's own rows.
drop policy if exists "saved_jobs: read own"   on public.saved_jobs;
drop policy if exists "saved_jobs: add own"    on public.saved_jobs;
drop policy if exists "saved_jobs: remove own" on public.saved_jobs;
create policy "saved_jobs: read own"   on public.saved_jobs for select to authenticated using (member_id = (select auth.uid()));
create policy "saved_jobs: add own"    on public.saved_jobs for insert to authenticated with check (member_id = (select auth.uid()));
create policy "saved_jobs: remove own" on public.saved_jobs for delete to authenticated using (member_id = (select auth.uid()));

-- member_career_paths: members manage their own; admins can read all
-- (needed for registrations-by-career-path reporting).
drop policy if exists "member_career_paths: read own, admins read all" on public.member_career_paths;
drop policy if exists "member_career_paths: add own"                   on public.member_career_paths;
drop policy if exists "member_career_paths: remove own"                on public.member_career_paths;
create policy "member_career_paths: read own, admins read all" on public.member_career_paths for select to authenticated using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy "member_career_paths: add own"    on public.member_career_paths for insert to authenticated with check (member_id = (select auth.uid()));
create policy "member_career_paths: remove own" on public.member_career_paths for delete to authenticated using (member_id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- 6. Table privileges (defence in depth on top of RLS)
-- ----------------------------------------------------------------------------
-- Supabase grants broad table privileges to anon and authenticated by
-- default and relies on RLS alone. These grants narrow that so a missing or
-- mistaken policy can't open a hole by itself.

-- Visitors: read-only on the three public catalogue tables; nothing else.
revoke all on table public.profiles, public.saved_jobs, public.member_career_paths from anon;
revoke all on table public.career_paths, public.jobs, public.announcements from anon;
grant select on table public.career_paths, public.jobs, public.announcements to anon;

-- Members: no TRUNCATE (it bypasses RLS), REFERENCES or TRIGGER anywhere.
revoke truncate, references, trigger on table
  public.career_paths, public.jobs, public.announcements,
  public.profiles, public.saved_jobs, public.member_career_paths
  from authenticated;

grant select, insert, update, delete on table public.career_paths, public.jobs, public.announcements to authenticated;
grant select, insert, delete on table public.saved_jobs, public.member_career_paths to authenticated;
revoke update on table public.saved_jobs, public.member_career_paths from authenticated;

-- Profiles: members may update ONLY these columns. role and email are
-- deliberately absent, so no member can promote themselves to admin or
-- detach their profile from their login email, whatever the app sends.
revoke insert, update, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (
  full_name, phone, area_of_residence, parish_unit, profession,
  employment_status, preferred_work_mode, consent_updates,
  avatar_url, bio, updated_at
) on table public.profiles to authenticated;

-- is_admin() is used inside policies, so both roles need to be able to call
-- it. It only ever reports on the caller's own account. (The trigger
-- functions need no grants: Postgres refuses to call them except as triggers.)
grant execute on function public.is_admin() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Reference data: the ten career paths from the brief
-- ----------------------------------------------------------------------------
-- Slugs match the ones hard-coded in src/app/jobs/JobsClient.tsx and
-- src/app/page.tsx. Names use " & " because the UI shortens them with
-- name.split(" & ")[0].

insert into public.career_paths (name, slug, icon) values
  ('Tech & Product',                   'tech-product',              '💻'),
  ('Finance & Accounting',             'finance-accounting',        '📊'),
  ('Media & Communications',           'media-communications',      '📣'),
  ('Law & Compliance',                 'law-compliance',            '⚖️'),
  ('Engineering & Project Management', 'engineering-pm',            '🛠️'),
  ('Business & Entrepreneurship',      'business-entrepreneurship', '🚀'),
  ('Public Sector & Administration',   'public-sector',             '🏛️'),
  ('Human Resources',                  'human-resources',           '🤝'),
  ('Health & Wellness',                'health-wellness',           '🩺'),
  ('Creative Industries',              'creative-industries',       '🎨')
on conflict (slug) do nothing;
