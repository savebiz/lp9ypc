-- ============================================================================
-- LP9 YPC — migration 4: referral flag on jobs (2026-10-10)
-- Admins tick "This is a referral link" when a job's Apply link is a referral
-- (e.g. Micro1, Turing). Members then see a small "Referral link via YPC" note.
-- Idempotent: safe to re-run. Jobs' existing RLS (admins write) applies.
-- Also tightens likes privacy (security review L3).
-- ============================================================================
alter table public.jobs add column if not exists is_referral boolean not null default false;

-- ---------------------------------------------------------------------------
-- Security review L3 (2026-10-10): members read only their OWN likes (counts
-- come from like_count), and liking an unknown post fails exactly like liking
-- a hidden one, so likes can't be used to probe which posts exist.
-- ---------------------------------------------------------------------------
drop policy if exists "post_likes: read in your communities" on public.post_likes;
drop policy if exists "post_likes: read your own" on public.post_likes;
create policy "post_likes: read your own" on public.post_likes for select to authenticated
  using (member_id = (select auth.uid()));

create or replace function public.post_likes_set_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type = 'thread' then
    select community_id into new.community_id from public.threads where id = new.target_id;
  else
    select community_id into new.community_id from public.replies where id = new.target_id;
  end if;
  if new.community_id is null then
    raise exception 'new row violates row-level security policy for table "post_likes"' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;
