-- ============================================================================
-- LP9 YPC — migration 6: member feedback + assistant link checks (2026-10-12)
-- Victor's choices: members only; no public ideas board yet; a daily assistant
-- flags dead Apply links and past events (flag only, never hides anything).
--   1. feedback: reports from members (and "found by the assistant" items).
--   2. my_feedback: a members-only view of their own items (no admin notes).
--   3. submit_feedback(): rate-limited insert, called only by the server.
--   4. link_health: consecutive failed link checks per job (admins read).
--   5. agent_runs may log a 'link_check' run.
-- Idempotent: safe to re-run. Run AFTER migrations 1-5.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'member' check (source in ('member', 'assistant')),
  kind          text not null check (kind in ('link', 'wrong_info', 'broken', 'idea')),
  message       text check (message is null or char_length(message) <= 400),
  -- Same-site path only (never a full URL), so admins can't be sent off-site.
  page_path     text check (page_path is null or (page_path ~ '^/[^[:space:]]*$' and page_path !~ '^//' and char_length(page_path) <= 300)),
  target_type   text check (target_type in ('job', 'announcement', 'career_path', 'community')),
  target_id     uuid,
  submitter_id  uuid references public.profiles (id) on delete cascade,
  status        text not null default 'new' check (status in ('new', 'looking', 'fixed', 'not_now')),
  admin_note    text check (admin_note is null or char_length(admin_note) <= 1000),   -- internal only
  public_reason text check (public_reason is null or char_length(public_reason) <= 200), -- shown to the sender
  handled_by    uuid references public.profiles (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (source = 'assistant' or submitter_id is not null),
  check (kind <> 'idea' or char_length(coalesce(message, '')) >= 3)
);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_target_idx on public.feedback (target_type, target_id);
create index if not exists feedback_submitter_idx on public.feedback (submitter_id, created_at desc);
-- The assistant never files the same open problem twice.
create unique index if not exists feedback_assistant_open_uq
  on public.feedback (target_type, target_id, kind)
  where source = 'assistant' and status in ('new', 'looking');

drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;
drop policy if exists "feedback: admins read" on public.feedback;
create policy "feedback: admins read" on public.feedback for select to authenticated
  using ((select public.is_admin()));

-- No browser writes at all: inserts go through submit_feedback() / the
-- assistant, updates through the admin route (service role, audited).
revoke all on table public.feedback from anon, authenticated;
grant select on table public.feedback to authenticated;
revoke truncate on table public.feedback from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Members see only their own items, without the internal admin note
-- ---------------------------------------------------------------------------
create or replace view public.my_feedback as
  select id, kind, message, page_path, target_type, target_id, status, public_reason, created_at, updated_at
    from public.feedback
   where source = 'member' and submitter_id = (select auth.uid());
revoke all on public.my_feedback from anon, authenticated;
grant select on public.my_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rate-limited submit (server only). Returns the new id; the existing id if
--    the same member already has an open report of the same kind on the same
--    item (so double taps don't duplicate); NULL when the member is over the
--    limit.
-- ---------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_submitter   uuid,
  p_kind        text,
  p_message     text,
  p_page_path   text,
  p_target_type text,
  p_target_id   uuid,
  p_limit       integer default 5,
  p_window      interval default interval '10 minutes'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  recent integer;
  existing uuid;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || p_submitter::text, 0));

  if p_target_id is not null then
    select id into existing
      from public.feedback
     where submitter_id = p_submitter and source = 'member' and kind = p_kind
       and target_type is not distinct from p_target_type and target_id = p_target_id
       and status in ('new', 'looking')
       and created_at > now() - interval '24 hours'
     limit 1;
    if existing is not null then
      return existing;
    end if;
  end if;

  select count(*) into recent
    from public.feedback
   where submitter_id = p_submitter and source = 'member' and created_at > now() - p_window;
  if recent >= p_limit then
    return null;
  end if;

  insert into public.feedback (source, kind, message, page_path, target_type, target_id, submitter_id)
  values ('member', p_kind, nullif(trim(p_message), ''), p_page_path, p_target_type, p_target_id, p_submitter)
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.submit_feedback(uuid, text, text, text, text, uuid, integer, interval) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid, text, text, text, text, uuid, integer, interval) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Link health (written by the daily assistant, read by admins)
-- ---------------------------------------------------------------------------
create table if not exists public.link_health (
  job_id      uuid primary key references public.jobs (id) on delete cascade,
  fail_count  smallint not null default 0,
  last_status text check (char_length(last_status) <= 40),
  last_http   integer,
  checked_at  timestamptz not null default now()
);
alter table public.link_health enable row level security;
drop policy if exists "link_health: admins read" on public.link_health;
create policy "link_health: admins read" on public.link_health for select to authenticated
  using ((select public.is_admin()));
revoke all on table public.link_health from anon, authenticated;
grant select on table public.link_health to authenticated;
revoke truncate on table public.link_health from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The run log accepts the link checker
-- ---------------------------------------------------------------------------
alter table public.agent_runs drop constraint if exists agent_runs_agent_check;
alter table public.agent_runs add constraint agent_runs_agent_check
  check (agent in ('job_scraper', 'career_research', 'moderation_sweep', 'link_check'));

-- ---------------------------------------------------------------------------
-- 6. Review fix (2026-10-12): page_path may not contain a backslash either —
--    browsers read "/\evil.com" as another website.
-- ---------------------------------------------------------------------------
alter table public.feedback drop constraint if exists feedback_page_path_check;
alter table public.feedback add constraint feedback_page_path_check
  check (page_path is null or (page_path ~ '^/[^[:space:]\\]*$' and page_path !~ '^//' and char_length(page_path) <= 300));
