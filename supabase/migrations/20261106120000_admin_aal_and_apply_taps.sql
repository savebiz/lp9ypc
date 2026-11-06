-- ============================================================================
-- LP9 YPC — migration 9 (2026-11-06; Victor: "Let's proceed" with stage 2 and
-- closing the two-step sign-in gap)
--   1. is_admin(): an admin who has set up an authenticator app only has admin
--      powers in the database when that session used the code (aal2). Admins
--      without an app keep working until ADMIN_MFA_REQUIRED makes them enrol.
--   2. apply_clicks: one row per tap on Apply, so the club can count "weekly
--      applying members". Written only by the server; nobody reads rows —
--      admins see totals through apply_weekly().
-- Idempotent: safe to re-run. Run AFTER migrations 1-8.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Admin powers need the code once an authenticator app is set up
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
       and (
         not exists (select 1 from auth.mfa_factors f
                      where f.user_id = p.id and f.status = 'verified')
         or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Apply taps
-- ---------------------------------------------------------------------------
create table if not exists public.apply_clicks (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  member_id  uuid references public.profiles (id) on delete cascade,  -- null = signed-out visitor
  source     text not null default 'card' check (source in ('card', 'detail', 'dashboard', 'welcome')),
  created_at timestamptz not null default now()
);
create index if not exists apply_clicks_created_idx on public.apply_clicks (created_at desc);
create index if not exists apply_clicks_job_idx on public.apply_clicks (job_id);
alter table public.apply_clicks enable row level security;
-- No policies and no grants: only the server (service role) writes, nobody reads rows.
revoke all on table public.apply_clicks from anon, authenticated;

-- Weekly totals for admins (weeks start Monday, Lagos time).
create or replace function public.apply_weekly(p_weeks integer default 8)
returns table (week_start date, applying_members bigint, member_taps bigint, visitor_taps bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    with weeks as (
      select generate_series(
               date_trunc('week', (now() at time zone 'Africa/Lagos'))::date - (7 * (least(greatest(p_weeks, 1), 52) - 1)),
               date_trunc('week', (now() at time zone 'Africa/Lagos'))::date,
               interval '7 days')::date as ws
    )
    select w.ws,
           count(distinct c.member_id),
           count(c.id) filter (where c.member_id is not null),
           count(c.id) filter (where c.member_id is null)
      from weeks w
      left join public.apply_clicks c
        on (c.created_at at time zone 'Africa/Lagos')::date >= w.ws
       and (c.created_at at time zone 'Africa/Lagos')::date <  w.ws + 7
     group by w.ws
     order by w.ws;
end;
$$;
revoke all on function public.apply_weekly(integer) from public, anon;
grant execute on function public.apply_weekly(integer) to authenticated;
