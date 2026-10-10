-- ============================================================================
-- LP9 YPC — migration 5 (approved by Victor 2026-10-10)
--   1. replies.reply_to_id: which reply was actually answered, so
--      "Replying to {Name}" survives a reload even after re-parenting.
--   2. admin_audit: permanent record of sensitive admin actions.
--   3. Event flyers: announcements.image_url/image_alt + a public storage
--      bucket that only admins can write to.
-- Idempotent: safe to re-run. Run AFTER migrations 1-4.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reply target
-- ---------------------------------------------------------------------------
alter table public.replies add column if not exists reply_to_id uuid references public.replies (id) on delete set null;

-- The depth trigger records the reply that was answered before it re-parents.
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
  if new.reply_to_id is null then
    new.reply_to_id := new.parent_id;
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

grant select (reply_to_id) on table public.replies to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Admin audit trail (written only by server routes with the service role)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (char_length(action) between 1 and 60),
  target_type  text check (char_length(target_type) <= 40),
  target_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;

drop policy if exists "admin_audit: admins read" on public.admin_audit;
create policy "admin_audit: admins read" on public.admin_audit for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.admin_audit from anon, authenticated;
grant select on table public.admin_audit to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Event flyers
-- ---------------------------------------------------------------------------
alter table public.announcements add column if not exists image_url text;
alter table public.announcements add column if not exists image_alt text;
do $$ begin
  alter table public.announcements add constraint announcements_image_url_http
    check (image_url is null or image_url ~* '^https://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.announcements add constraint announcements_image_alt_len
    check (image_alt is null or char_length(image_alt) <= 300);
exception when duplicate_object then null; end $$;

-- Public bucket (flyers are public announcements); 5 MB; images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event-flyers: admins upload" on storage.objects;
drop policy if exists "event-flyers: admins update" on storage.objects;
drop policy if exists "event-flyers: admins delete" on storage.objects;
drop policy if exists "event-flyers: admins read" on storage.objects;
create policy "event-flyers: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and (select public.is_admin()));
create policy "event-flyers: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and (select public.is_admin()))
  with check (bucket_id = 'event-flyers' and (select public.is_admin()));
create policy "event-flyers: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-flyers' and (select public.is_admin()));
-- Public reading goes through the bucket's public URL. Admins also need a
-- select policy, because storage only deletes rows the caller can select.
create policy "event-flyers: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'event-flyers' and (select public.is_admin()));
