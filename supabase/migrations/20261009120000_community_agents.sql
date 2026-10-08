-- ============================================================================
-- LP9 YPC — Phase 2: career goal, AI agents, job scraper, portals, communities
-- ============================================================================
-- Run AFTER 20261008120000_initial_schema.sql. Safe to re-run (idempotent).
--
-- Security model additions:
--   * Discussion posts (threads/replies) have NO client write grants. Every
--     write goes through a server route that checks the session, membership,
--     lock state and rate limits, runs AI moderation, and then writes with the
--     service role. Members can only READ visible posts (plus their own).
--   * Agents only ever PROPOSE: scraped jobs land as review_status='pending',
--     career-path ideas land as candidates, and moderation holds go to humans.
--   * Agent and moderation logs are readable only by admins / moderators.
--   * Member names on posts come from member_directory (first name + last
--     initial) — profiles stay private.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Profiles: optional career goal (owner-approved signup question)
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists career_goal text check (career_goal in ('grow', 'switch', 'explore'));

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
  new.career_goal         := nullif(trim(new.career_goal), '');
  new.bio                 := nullif(trim(new.bio), '');
  return new;
end;
$$;

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
    employment_status, preferred_work_mode, career_goal, consent_updates
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
    case when meta ->> 'career_goal' in ('grow', 'switch', 'explore')
         then meta ->> 'career_goal' end,
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

grant update (career_goal) on table public.profiles to authenticated;

-- Public-safe author names for discussion posts: first name + last initial.
-- Runs with the view owner's rights (so it can read profiles despite RLS) and
-- exposes ONLY id + display_name, to signed-in members only.
create or replace view public.member_directory as
select
  p.id,
  coalesce(
    nullif(
      case when array_length(x.parts, 1) > 1
           then x.parts[1] || ' ' || left(x.parts[array_length(x.parts, 1)], 1) || '.'
           else x.parts[1] end,
      ''),
    'Member') as display_name
from public.profiles p
cross join lateral (select regexp_split_to_array(trim(p.full_name), '\s+') as parts) x;

revoke all on public.member_directory from public, anon, authenticated;
grant select on public.member_directory to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Career-path research agent
-- ----------------------------------------------------------------------------
-- Research runs per normalized PROFESSION (not per member): cheaper, and no
-- member identity is ever sent to the AI.

create table if not exists public.profession_research (
  id               uuid primary key default gen_random_uuid(),
  profession_key   text not null unique check (char_length(profession_key) between 1 and 120),
  profession_label text not null check (char_length(profession_label) between 1 and 120),
  summary          text check (char_length(summary) <= 4000),
  matches          jsonb not null default '[]'::jsonb,  -- [{ "slug": "...", "reason": "..." }]
  switch_options   jsonb not null default '[]'::jsonb,  -- [{ "slug": "...", "reason": "..." }]
  sources          jsonb not null default '[]'::jsonb,  -- [{ "title": "...", "url": "https://..." }]
  status           text not null default 'pending' check (status in ('pending', 'done', 'error')),
  error            text check (char_length(error) <= 1000),
  researched_at    timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.career_path_suggestions (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.profiles (id) on delete cascade,
  career_path_id  uuid not null references public.career_paths (id) on delete cascade,
  kind            text not null check (kind in ('match', 'switch')),
  reason          text check (char_length(reason) <= 500),
  sources         jsonb not null default '[]'::jsonb,
  status          text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (member_id, career_path_id)
);
create index if not exists career_path_suggestions_member_idx on public.career_path_suggestions (member_id, status);

create table if not exists public.career_path_candidates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(name) between 1 and 80),
  rationale    text check (char_length(rationale) <= 1000),
  evidence     jsonb not null default '[]'::jsonb,  -- [{ "title": "...", "url": "https://..." }]
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 3. Job scraper: sources + review queue on jobs
-- ----------------------------------------------------------------------------

create table if not exists public.job_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  url          text not null unique,
  is_active    boolean not null default true,
  notes        text check (char_length(notes) <= 1000),
  last_run_at  timestamptz,
  last_status  text check (last_status in ('ok', 'error', 'blocked', 'empty')),
  last_error   text check (char_length(last_error) <= 1000),
  jobs_found   integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint job_sources_url_http check (url ~* '^https?://[^[:space:]]+$' and char_length(url) <= 2000)
);

alter table public.jobs add column if not exists source_id uuid references public.job_sources (id) on delete set null;
alter table public.jobs add column if not exists source_page_url text check (char_length(source_page_url) <= 2000);
alter table public.jobs add column if not exists dedupe_key text check (char_length(dedupe_key) <= 128);
alter table public.jobs add column if not exists review_status text not null default 'approved'
  check (review_status in ('pending', 'approved', 'rejected'));
create unique index if not exists jobs_dedupe_key_idx on public.jobs (dedupe_key) where dedupe_key is not null;
create index if not exists jobs_review_status_idx on public.jobs (review_status);


-- ----------------------------------------------------------------------------
-- 4. Announcements become a News & events portal
-- ----------------------------------------------------------------------------

alter table public.announcements add column if not exists scope text not null default 'province'
  check (scope in ('parish', 'province', 'region', 'national'));
alter table public.announcements add column if not exists scope_label text check (char_length(scope_label) <= 120);
alter table public.announcements add column if not exists kind text not null default 'announcement'
  check (kind in ('announcement', 'event'));
alter table public.announcements add column if not exists starts_at timestamptz;
alter table public.announcements add column if not exists ends_at timestamptz;
alter table public.announcements add column if not exists location text check (char_length(location) <= 200);
alter table public.announcements add column if not exists link_url text
  check (link_url ~* '^https?://[^[:space:]]+$' and char_length(link_url) <= 2000);
create index if not exists announcements_portal_idx on public.announcements (is_active, scope, kind, starts_at);


-- ----------------------------------------------------------------------------
-- 5. Communities, discussion board, moderation
-- ----------------------------------------------------------------------------

create table if not exists public.communities (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name            text not null unique check (char_length(name) between 1 and 80),
  description     text check (char_length(description) <= 500),
  kind            text not null check (kind in ('career', 'interest')),
  career_path_id  uuid references public.career_paths (id) on delete set null,
  icon            text not null default '' check (char_length(icon) <= 40),
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id  uuid not null references public.communities (id) on delete cascade,
  member_id     uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'member' check (role in ('member', 'manager')),
  joined_at     timestamptz not null default now(),
  primary key (community_id, member_id)
);
create index if not exists community_members_member_idx on public.community_members (member_id);

create table if not exists public.threads (
  id                     uuid primary key default gen_random_uuid(),
  community_id           uuid not null references public.communities (id) on delete cascade,
  author_id              uuid not null references public.profiles (id) on delete cascade,
  title                  text not null check (char_length(title) between 3 and 160),
  body                   text not null check (char_length(body) between 1 and 5000),
  status                 text not null default 'pending' check (status in ('pending', 'visible', 'held', 'removed')),
  needs_review           boolean not null default false,  -- AI was unavailable; sweep re-checks
  moderation_reason      text check (char_length(moderation_reason) <= 500),
  moderation_categories  text[] not null default '{}',
  moderated_by           text check (moderated_by in ('agent', 'human')),
  is_pinned              boolean not null default false,
  is_locked              boolean not null default false,
  reply_count            integer not null default 0,
  last_activity_at       timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists threads_list_idx on public.threads (community_id, status, is_pinned desc, last_activity_at desc);
create index if not exists threads_author_idx on public.threads (author_id);
create index if not exists threads_review_idx on public.threads (needs_review) where needs_review;

create table if not exists public.replies (
  id                     uuid primary key default gen_random_uuid(),
  thread_id              uuid not null references public.threads (id) on delete cascade,
  community_id           uuid not null references public.communities (id) on delete cascade,
  author_id              uuid not null references public.profiles (id) on delete cascade,
  body                   text not null check (char_length(body) between 1 and 3000),
  status                 text not null default 'pending' check (status in ('pending', 'visible', 'held', 'removed')),
  needs_review           boolean not null default false,
  moderation_reason      text check (char_length(moderation_reason) <= 500),
  moderation_categories  text[] not null default '{}',
  moderated_by           text check (moderated_by in ('agent', 'human')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists replies_thread_idx on public.replies (thread_id, created_at);
create index if not exists replies_author_idx on public.replies (author_id);
create index if not exists replies_review_idx on public.replies (needs_review) where needs_review;

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  target_type   text not null check (target_type in ('thread', 'reply')),
  target_id     uuid not null,
  reporter_id   uuid not null references public.profiles (id) on delete cascade,
  reason        text not null check (char_length(reason) between 3 and 500),
  status        text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by   uuid references public.profiles (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
create index if not exists reports_queue_idx on public.reports (community_id, status);

create table if not exists public.moderation_log (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities (id) on delete cascade,
  target_type   text check (target_type in ('thread', 'reply')),
  target_id     uuid,
  actor_type    text not null check (actor_type in ('agent', 'human', 'system')),
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null check (action in (
                  'allow', 'hold', 'remove', 'restore', 'pin', 'unpin', 'lock', 'unlock',
                  'delete_own', 'report_resolve', 'report_dismiss', 'flag')),
  reason        text check (char_length(reason) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists moderation_log_community_idx on public.moderation_log (community_id, created_at desc);

create table if not exists public.agent_runs (
  id               uuid primary key default gen_random_uuid(),
  agent            text not null check (agent in ('job_scraper', 'career_research', 'moderation_sweep')),
  status           text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  items_processed  integer not null default 0,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  web_searches     integer not null default 0,
  error            text check (char_length(error) <= 2000),
  details          jsonb not null default '{}'::jsonb
);
create index if not exists agent_runs_recent_idx on public.agent_runs (agent, started_at desc);


-- ----------------------------------------------------------------------------
-- 6. Helper functions and triggers
-- ----------------------------------------------------------------------------

create or replace function public.is_community_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and member_id = (select auth.uid())
  );
$$;

-- Admins moderate everywhere; managers moderate their own community.
create or replace function public.can_moderate(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin()) or exists (
    select 1 from public.community_members
    where community_id = cid and member_id = (select auth.uid()) and role = 'manager'
  );
$$;

grant execute on function public.is_community_member(uuid) to anon, authenticated;
grant execute on function public.can_moderate(uuid) to anon, authenticated;

-- Keep thread counters in step with VISIBLE replies.
create or replace function public.refresh_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := coalesce(new.thread_id, old.thread_id);
begin
  update public.threads t
     set reply_count = (select count(*) from public.replies r where r.thread_id = tid and r.status = 'visible'),
         last_activity_at = greatest(
           t.created_at,
           coalesce((select max(r.created_at) from public.replies r where r.thread_id = tid and r.status = 'visible'), t.created_at))
   where t.id = tid;
  return null;
end;
$$;

drop trigger if exists replies_refresh_thread on public.replies;
create trigger replies_refresh_thread
  after insert or delete or update of status on public.replies
  for each row execute function public.refresh_thread_activity();

-- A report's community always comes from its target, never from the client,
-- so nobody can push a report into another community's queue.
create or replace function public.reports_set_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  if new.target_type = 'thread' then
    select community_id into cid from public.threads where id = new.target_id;
  else
    select community_id into cid from public.replies where id = new.target_id;
  end if;
  if cid is null then
    raise exception 'Reported post not found' using errcode = 'P0002';
  end if;
  new.community_id := cid;
  return new;
end;
$$;

drop trigger if exists reports_set_community on public.reports;
create trigger reports_set_community
  before insert on public.reports
  for each row execute function public.reports_set_community();

-- updated_at on the new mutable tables (reuses set_updated_at from migration 1).
drop trigger if exists job_sources_set_updated_at on public.job_sources;
create trigger job_sources_set_updated_at before update on public.job_sources
  for each row execute function public.set_updated_at();
drop trigger if exists communities_set_updated_at on public.communities;
create trigger communities_set_updated_at before update on public.communities
  for each row execute function public.set_updated_at();
drop trigger if exists threads_set_updated_at on public.threads;
create trigger threads_set_updated_at before update on public.threads
  for each row execute function public.set_updated_at();
drop trigger if exists replies_set_updated_at on public.replies;
create trigger replies_set_updated_at before update on public.replies
  for each row execute function public.set_updated_at();
drop trigger if exists career_path_suggestions_set_updated_at on public.career_path_suggestions;
create trigger career_path_suggestions_set_updated_at before update on public.career_path_suggestions
  for each row execute function public.set_updated_at();

-- Public counts for the community directory (no personal data).
create or replace view public.community_overview as
select
  c.id as community_id,
  (select count(*) from public.community_members m where m.community_id = c.id)::int as member_count,
  (select count(*) from public.threads t where t.community_id = c.id and t.status = 'visible')::int as thread_count,
  (select max(t.last_activity_at) from public.threads t where t.community_id = c.id and t.status = 'visible') as last_activity_at
from public.communities c
where c.is_active;

revoke all on public.community_overview from public, anon, authenticated;
grant select on public.community_overview to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Row-level security
-- ----------------------------------------------------------------------------

alter table public.profession_research     enable row level security;
alter table public.career_path_suggestions enable row level security;
alter table public.career_path_candidates  enable row level security;
alter table public.job_sources             enable row level security;
alter table public.communities             enable row level security;
alter table public.community_members       enable row level security;
alter table public.threads                 enable row level security;
alter table public.replies                 enable row level security;
alter table public.reports                 enable row level security;
alter table public.moderation_log          enable row level security;
alter table public.agent_runs              enable row level security;

-- jobs: pending/rejected scraped jobs are invisible to everyone but admins.
drop policy if exists "jobs: anyone can read active, admins read all" on public.jobs;
create policy "jobs: anyone can read active, admins read all" on public.jobs for select to anon, authenticated
  using ((is_active and review_status = 'approved') or (select public.is_admin()));

-- career_path_suggestions: own rows; only the status can change (column grant).
drop policy if exists "career_path_suggestions: read own"   on public.career_path_suggestions;
drop policy if exists "career_path_suggestions: update own" on public.career_path_suggestions;
create policy "career_path_suggestions: read own" on public.career_path_suggestions for select to authenticated
  using (member_id = (select auth.uid()));
create policy "career_path_suggestions: update own" on public.career_path_suggestions for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

-- profession_research + career_path_candidates: admins only.
drop policy if exists "profession_research: admins read" on public.profession_research;
create policy "profession_research: admins read" on public.profession_research for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "career_path_candidates: admins read"   on public.career_path_candidates;
drop policy if exists "career_path_candidates: admins update" on public.career_path_candidates;
create policy "career_path_candidates: admins read" on public.career_path_candidates for select to authenticated
  using ((select public.is_admin()));
create policy "career_path_candidates: admins update" on public.career_path_candidates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- job_sources: admins only.
drop policy if exists "job_sources: admins read"   on public.job_sources;
drop policy if exists "job_sources: admins insert" on public.job_sources;
drop policy if exists "job_sources: admins update" on public.job_sources;
drop policy if exists "job_sources: admins delete" on public.job_sources;
create policy "job_sources: admins read"   on public.job_sources for select to authenticated using ((select public.is_admin()));
create policy "job_sources: admins insert" on public.job_sources for insert to authenticated with check ((select public.is_admin()));
create policy "job_sources: admins update" on public.job_sources for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "job_sources: admins delete" on public.job_sources for delete to authenticated using ((select public.is_admin()));

-- communities: anyone browses active ones; admins manage.
drop policy if exists "communities: anyone reads active, admins all" on public.communities;
drop policy if exists "communities: admins insert" on public.communities;
drop policy if exists "communities: admins update" on public.communities;
drop policy if exists "communities: admins delete" on public.communities;
create policy "communities: anyone reads active, admins all" on public.communities for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "communities: admins insert" on public.communities for insert to authenticated with check ((select public.is_admin()));
create policy "communities: admins update" on public.communities for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "communities: admins delete" on public.communities for delete to authenticated using ((select public.is_admin()));

-- community_members: members join/leave themselves (as 'member' only);
-- admins assign or remove managers.
drop policy if exists "community_members: members read"       on public.community_members;
drop policy if exists "community_members: join as member"     on public.community_members;
drop policy if exists "community_members: admins add"         on public.community_members;
drop policy if exists "community_members: admins change role" on public.community_members;
drop policy if exists "community_members: leave or admin remove" on public.community_members;
create policy "community_members: members read" on public.community_members for select to authenticated using (true);
create policy "community_members: join as member" on public.community_members for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and role = 'member'
    and exists (select 1 from public.communities c where c.id = community_id and c.is_active)
  );
create policy "community_members: admins add" on public.community_members for insert to authenticated
  with check ((select public.is_admin()));
create policy "community_members: admins change role" on public.community_members for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "community_members: leave or admin remove" on public.community_members for delete to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

-- threads / replies: READ ONLY for clients. Writes happen server-side.
drop policy if exists "threads: read visible, own, or as moderator" on public.threads;
create policy "threads: read visible, own, or as moderator" on public.threads for select to authenticated
  using (status = 'visible' or author_id = (select auth.uid()) or (select public.can_moderate(community_id)));
drop policy if exists "replies: read visible, own, or as moderator" on public.replies;
create policy "replies: read visible, own, or as moderator" on public.replies for select to authenticated
  using (status = 'visible' or author_id = (select auth.uid()) or (select public.can_moderate(community_id)));

-- reports: members file their own; moderators of that community review.
drop policy if exists "reports: file own"                  on public.reports;
drop policy if exists "reports: read own or as moderator"  on public.reports;
drop policy if exists "reports: moderators resolve"        on public.reports;
create policy "reports: file own" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy "reports: read own or as moderator" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.can_moderate(community_id)));
create policy "reports: moderators resolve" on public.reports for update to authenticated
  using ((select public.can_moderate(community_id))) with check ((select public.can_moderate(community_id)));

-- logs: read-only, moderators / admins.
drop policy if exists "moderation_log: moderators read" on public.moderation_log;
create policy "moderation_log: moderators read" on public.moderation_log for select to authenticated
  using ((select public.can_moderate(community_id)));
drop policy if exists "agent_runs: admins read" on public.agent_runs;
create policy "agent_runs: admins read" on public.agent_runs for select to authenticated
  using ((select public.is_admin()));


-- ----------------------------------------------------------------------------
-- 8. Table privileges (defence in depth on top of RLS)
-- ----------------------------------------------------------------------------

revoke all on table
  public.profession_research, public.career_path_suggestions, public.career_path_candidates,
  public.job_sources, public.communities, public.community_members, public.threads, public.replies,
  public.reports, public.moderation_log, public.agent_runs
  from anon;
grant select on table public.communities to anon;

revoke all on table
  public.profession_research, public.career_path_suggestions, public.career_path_candidates,
  public.job_sources, public.communities, public.community_members, public.threads, public.replies,
  public.reports, public.moderation_log, public.agent_runs
  from authenticated;

-- Read-only to clients (writes are server-side with the service role).
grant select on table
  public.profession_research, public.threads, public.replies, public.moderation_log, public.agent_runs
  to authenticated;

-- Admin-managed tables (RLS limits writes to admins).
grant select, insert, update, delete on table public.job_sources, public.communities to authenticated;

-- Members join / leave; admins change roles.
grant select, insert, delete on table public.community_members to authenticated;
grant update (role) on table public.community_members to authenticated;

-- Members may only change the status of their own suggestions.
grant select on table public.career_path_suggestions to authenticated;
grant update (status) on table public.career_path_suggestions to authenticated;

-- Admins review candidates.
grant select on table public.career_path_candidates to authenticated;
grant update (status, reviewed_by, reviewed_at) on table public.career_path_candidates to authenticated;

-- Reports: file (community_id is overwritten by trigger) and resolve.
grant select on table public.reports to authenticated;
grant insert (community_id, target_type, target_id, reporter_id, reason) on table public.reports to authenticated;
grant update (status, resolved_by, resolved_at) on table public.reports to authenticated;


-- ----------------------------------------------------------------------------
-- 9. Seed communities (admin-editable afterwards)
-- ----------------------------------------------------------------------------

insert into public.communities (slug, name, description, kind, career_path_id, icon)
select cp.slug, cp.name,
       'Opportunities, advice and conversation for people working in — or moving into — ' || cp.name || '.',
       'career', cp.id, cp.slug
from public.career_paths cp
on conflict (slug) do nothing;

insert into public.communities (slug, name, description, kind, icon) values
  ('ypc-lounge',            'YPC Lounge',              'Say hello, introduce yourself and chat with the whole club.', 'interest', 'message-circle'),
  ('faith-fellowship',      'Faith & Fellowship',      'Encouragement, prayer requests and faith at work.',            'interest', 'church'),
  ('sports-fitness',        'Sports & Fitness',        'Football, runs, gym buddies and active weekends.',             'interest', 'dumbbell'),
  ('arts-music-culture',    'Arts, Music & Culture',   'Music, art, film and creative projects.',                      'interest', 'music'),
  ('volunteering-outreach', 'Volunteering & Outreach', 'Give back: outreach, mentoring and service projects.',          'interest', 'hand-heart'),
  ('health-wellbeing',      'Health & Wellbeing',      'Mental health, rest and looking after yourself.',              'interest', 'heart-pulse'),
  ('books-learning',        'Books & Learning',        'Book club, courses and learning together.',                    'interest', 'book-open')
on conflict (slug) do nothing;
