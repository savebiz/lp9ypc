-- ============================================================================
-- LP9 YPC — post-setup verification (read-only; changes nothing)
-- ============================================================================
-- Run in the Supabase SQL Editor after ALL FIVE migrations (initial schema,
-- community_agents, community_social, job_referral_flag, replyto_audit_flyers).
-- 38 checks. Every row should show ok = true. If any row says false, stop and send the
-- result over before going further.
-- ============================================================================

with expected(name) as (
  values ('profiles'), ('career_paths'), ('member_career_paths'),
         ('jobs'), ('saved_jobs'), ('announcements')
)
select '01. all 6 tables exist' as check_name,
       (select count(*) from information_schema.tables t
          join expected e on e.name = t.table_name
         where t.table_schema = 'public') = 6 as ok
union all
select '02. row-level security is ON for all 6 tables',
       (select bool_and(c.relrowsecurity) and count(*) = 6
          from pg_class c join expected e on e.name = c.relname
         where c.relnamespace = 'public'::regnamespace)
union all
select '03. the 10 career paths from the brief are seeded',
       (select count(*) = 10 from public.career_paths)
union all
select '04. signup trigger is installed on auth.users',
       exists (select 1 from pg_trigger
                where tgname = 'on_auth_user_created'
                  and tgrelid = 'auth.users'::regclass
                  and not tgisinternal)
union all
select '05. all 48 security policies are installed (20 + 24 + 3 + 1 from migrations 1-5)',
       (select count(*) = 48 from pg_policies where schemaname = 'public')
union all
select '06. members CANNOT change their own role (blocks self-promotion to admin)',
       not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
union all
select '07. members CANNOT change their profile email',
       not has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
union all
select '08. members CAN update their own profile details',
       has_column_privilege('authenticated', 'public.profiles', 'employment_status', 'UPDATE')
union all
select '09. visitors CANNOT read member profiles',
       not has_table_privilege('anon', 'public.profiles', 'SELECT')
union all
select '10. visitors CANNOT read saved jobs or member career paths',
       not has_table_privilege('anon', 'public.saved_jobs', 'SELECT')
       and not has_table_privilege('anon', 'public.member_career_paths', 'SELECT')
union all
select '11. visitors CANNOT write jobs or announcements',
       not has_table_privilege('anon', 'public.jobs', 'INSERT')
       and not has_table_privilege('anon', 'public.announcements', 'INSERT')
union all
select '12. visitors CAN read jobs, career paths and announcements',
       has_table_privilege('anon', 'public.jobs', 'SELECT')
       and has_table_privilege('anon', 'public.career_paths', 'SELECT')
       and has_table_privilege('anon', 'public.announcements', 'SELECT')
union all
select '13. nobody but the owner can TRUNCATE (which would bypass RLS)',
       not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
       and not has_table_privilege('anon', 'public.jobs', 'TRUNCATE')
union all
select '14. every job must have an http(s) Apply link',
       exists (select 1 from pg_constraint
                where conname = 'jobs_application_link_http'
                  and conrelid = 'public.jobs'::regclass)
union all
select '15. no member is an admin yet (FALSE is expected once you have promoted yourself)',
       (select count(*) = 0 from public.profiles where role = 'admin')
union all
select '16. all 11 Phase 2 tables exist with row-level security ON',
       (select count(*) = 11 and bool_and(c.relrowsecurity) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
           and c.relname in ('profession_research','career_path_suggestions','career_path_candidates','job_sources',
                             'communities','community_members','threads','replies','reports','moderation_log','agent_runs'))
union all
select '17. 17 communities seeded (10 career + 7 interest)',
       (select count(*) = 17 from public.communities)
union all
select '18. members CANNOT write discussion posts directly (server-side only)',
       not has_table_privilege('authenticated', 'public.threads', 'INSERT')
       and not has_table_privilege('authenticated', 'public.replies', 'INSERT')
       and not has_table_privilege('authenticated', 'public.threads', 'UPDATE')
union all
select '19. visitors CANNOT read discussions, members, or agent logs',
       not has_table_privilege('anon', 'public.threads', 'SELECT')
       and not has_table_privilege('anon', 'public.community_members', 'SELECT')
       and not has_table_privilege('anon', 'public.agent_runs', 'SELECT')
union all
select '20. member names are exposed only via member_directory, to members only',
       has_table_privilege('authenticated', 'public.member_directory', 'SELECT')
       and not has_table_privilege('anon', 'public.member_directory', 'SELECT')
union all
select '21. members can change ONLY the status of their career suggestions',
       has_column_privilege('authenticated', 'public.career_path_suggestions', 'status', 'UPDATE')
       and not has_column_privilege('authenticated', 'public.career_path_suggestions', 'career_path_id', 'UPDATE')
union all
select '22. members can set their career goal',
       has_column_privilege('authenticated', 'public.profiles', 'career_goal', 'UPDATE')
union all
select '23. jobs have a review queue for scraped listings (review_status column)',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'review_status')
union all
select '24. report community is set server-side (trigger installed)',
       exists (select 1 from pg_trigger where tgname = 'reports_set_community' and not tgisinternal)
union all
select '25. members CANNOT read moderation notes on posts (moderators use post_moderation_notes)',
       not has_column_privilege('authenticated', 'public.threads', 'moderation_reason', 'SELECT')
       and not has_column_privilege('authenticated', 'public.replies', 'moderation_categories', 'SELECT')
       and has_column_privilege('authenticated', 'public.threads', 'title', 'SELECT')
union all
select '26. reports can only be resolved through the logged server route',
       not has_table_privilege('authenticated', 'public.reports', 'UPDATE')
union all
select '27. only the server can claim posting slots (atomic rate limit)',
       not has_function_privilege('authenticated', 'public.claim_post_slot(uuid, uuid, uuid, text, text, integer, interval)', 'EXECUTE')
       and has_function_privilege('authenticated', 'public.post_moderation_notes(text, uuid[])', 'EXECUTE')
union all
select '28. likes table exists with row-level security ON',
       coalesce((select relrowsecurity from pg_class where oid = 'public.post_likes'::regclass), false)
union all
select '29. members can like and unlike, but never edit a like',
       has_column_privilege('authenticated', 'public.post_likes', 'target_id', 'INSERT')
       and not has_column_privilege('authenticated', 'public.post_likes', 'community_id', 'INSERT')
       and has_table_privilege('authenticated', 'public.post_likes', 'DELETE')
       and not has_table_privilege('authenticated', 'public.post_likes', 'UPDATE')
       and not has_table_privilege('anon', 'public.post_likes', 'SELECT')
union all
select '30. a like can only be added for yourself, on a visible post in your community',
       exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_likes'
                and cmd = 'INSERT' and with_check like '%auth.uid()%' and with_check like '%can_like%')
union all
select '31. like counts and reply nesting are kept by triggers',
       exists (select 1 from pg_trigger where tgname = 'post_likes_count' and not tgisinternal)
       and exists (select 1 from pg_trigger where tgname = 'post_likes_set_community' and not tgisinternal)
       and exists (select 1 from pg_trigger where tgname = 'replies_set_depth' and not tgisinternal)
union all
select '32. members can read like counts, nesting and edit markers, but not write posts',
       has_column_privilege('authenticated', 'public.threads', 'like_count', 'SELECT')
       and has_column_privilege('authenticated', 'public.replies', 'parent_id', 'SELECT')
       and has_column_privilege('authenticated', 'public.replies', 'edited_at', 'SELECT')
       and not has_table_privilege('authenticated', 'public.replies', 'UPDATE')
union all
select '33. replies nest at most 3 levels deep',
       exists (select 1 from pg_constraint where conname = 'replies_depth_range')
union all
select '34. jobs can be marked as referral links (is_referral column)',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'jobs' and column_name = 'is_referral')
union all
select '35. replies remember which reply they answered (reply_to_id)',
       has_column_privilege('authenticated', 'public.replies', 'reply_to_id', 'SELECT')
union all
select '36. admin audit trail: admins read it, nobody writes from the browser',
       coalesce((select relrowsecurity from pg_class where oid = 'public.admin_audit'::regclass), false)
       and not has_table_privilege('authenticated', 'public.admin_audit', 'INSERT')
       and not has_table_privilege('anon', 'public.admin_audit', 'SELECT')
union all
select '37. event flyers bucket exists, public, images only, 5 MB',
       exists (select 1 from storage.buckets where id = 'event-flyers' and public
                and file_size_limit = 5242880 and allowed_mime_types @> array['image/jpeg'])
union all
select '38. only admins can upload, change, delete or list flyers',
       (select count(*) = 4 from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname like 'event-flyers:%' and (coalesce(qual, '') || coalesce(with_check, '')) like '%is_admin%')
order by 1;
