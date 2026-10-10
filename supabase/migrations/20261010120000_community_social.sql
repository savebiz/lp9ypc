-- ============================================================================
-- LP9 YPC — migration 3: community social features (2026-10-10)
-- Replies to replies (3 levels), likes on posts and replies, "edited" markers.
-- Idempotent: safe to re-run. Run AFTER 20261008120000 and 20261009120000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.replies add column if not exists parent_id  uuid references public.replies (id) on delete cascade;
alter table public.replies add column if not exists depth      smallint not null default 0;
alter table public.replies add column if not exists like_count integer  not null default 0;
alter table public.replies add column if not exists edited_at  timestamptz;
alter table public.threads add column if not exists like_count integer  not null default 0;
alter table public.threads add column if not exists edited_at  timestamptz;

do $$ begin
  alter table public.replies add constraint replies_depth_range check (depth between 0 and 2);
exception when duplicate_object then null; end $$;

create index if not exists replies_parent_idx on public.replies (parent_id) where parent_id is not null;
create index if not exists threads_top_idx on public.threads (community_id, status, like_count desc, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Reply nesting: parent must be in the same thread; at most 3 levels
--    (depth 0, 1, 2). A reply to a depth-2 reply attaches to that reply's
--    parent, so the conversation stays readable on a phone.
-- ---------------------------------------------------------------------------
create or replace function public.replies_set_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;
  select id, thread_id, parent_id, depth into p from public.replies where id = new.parent_id;
  if not found or p.thread_id <> new.thread_id then
    raise exception 'reply parent must belong to the same discussion' using errcode = '23514';
  end if;
  if p.id = new.id then
    raise exception 'a reply cannot be its own parent' using errcode = '23514';
  end if;
  if p.depth >= 2 then
    new.parent_id := p.parent_id;
    new.depth := 2;
  else
    new.depth := p.depth + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists replies_set_depth on public.replies;
create trigger replies_set_depth
  before insert or update of parent_id on public.replies
  for each row execute function public.replies_set_depth();

-- ---------------------------------------------------------------------------
-- 3. Likes
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  member_id    uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('thread', 'reply')),
  target_id    uuid not null,
  community_id uuid not null references public.communities (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (member_id, target_type, target_id)
);
create index if not exists post_likes_target_idx on public.post_likes (target_type, target_id);
alter table public.post_likes enable row level security;

-- Can the caller like this post? Visible post (and visible parent thread for a
-- reply) in a community they belong to.
create or replace function public.can_like(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_type = 'thread' then exists (
      select 1 from public.threads t
       where t.id = p_id and t.status = 'visible'
         and public.is_community_member(t.community_id))
    when p_type = 'reply' then exists (
      select 1 from public.replies r
        join public.threads t on t.id = r.thread_id
       where r.id = p_id and r.status = 'visible' and t.status = 'visible'
         and public.is_community_member(r.community_id))
    else false
  end;
$$;
revoke all on function public.can_like(text, uuid) from public;
grant execute on function public.can_like(text, uuid) to authenticated;

-- community_id always comes from the post itself, never from the client.
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
    raise exception 'post not found' using errcode = '23503';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists post_likes_set_community on public.post_likes;
create trigger post_likes_set_community
  before insert on public.post_likes
  for each row execute function public.post_likes_set_community();

-- Keep like_count in step (security definer: members can't update posts).
create or replace function public.post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t_type text := coalesce(new.target_type, old.target_type);
  t_id   uuid := coalesce(new.target_id, old.target_id);
  n      integer;
begin
  select count(*) into n from public.post_likes where target_type = t_type and target_id = t_id;
  if t_type = 'thread' then
    update public.threads set like_count = n where id = t_id;
  else
    update public.replies set like_count = n where id = t_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.post_likes_count();

-- Policies (3)
drop policy if exists "post_likes: read in your communities" on public.post_likes;
drop policy if exists "post_likes: like visible posts"       on public.post_likes;
drop policy if exists "post_likes: unlike your own"          on public.post_likes;
create policy "post_likes: read in your communities" on public.post_likes for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_community_member(community_id)));
create policy "post_likes: like visible posts" on public.post_likes for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.can_like(target_type, target_id)));
create policy "post_likes: unlike your own" on public.post_likes for delete to authenticated
  using (member_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
revoke all on table public.post_likes from anon, authenticated;
grant select (member_id, target_type, target_id, community_id, created_at), insert (member_id, target_type, target_id), delete
  on table public.post_likes to authenticated;
revoke truncate on table public.post_likes from authenticated, anon;

-- New post columns are readable; writes still go through server routes only.
grant select (like_count, edited_at) on table public.threads to authenticated;
grant select (parent_id, depth, like_count, edited_at) on table public.replies to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Author badges: members may learn whether a post author is a YPC admin
--    (only that boolean, only for the ids asked about, only when signed in).
-- ---------------------------------------------------------------------------
create or replace function public.admin_badges(p_ids uuid[])
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
   where (select auth.uid()) is not null
     and p.id = any (p_ids[1:200])
     and p.role = 'admin';
$$;
revoke all on function public.admin_badges(uuid[]) from public;
grant execute on function public.admin_badges(uuid[]) to authenticated;
