-- ============================================================================
-- LP9 YPC — post-setup verification (read-only; changes nothing)
-- ============================================================================
-- Run in the Supabase SQL Editor after the initial-schema migration.
-- Every row should show ok = true. If any row says false, stop and send the
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
select '05. all 20 security policies are installed',
       (select count(*) = 20 from pg_policies where schemaname = 'public')
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
select '15. no member is an admin yet (expected until you promote yourself)',
       (select count(*) = 0 from public.profiles where role = 'admin')
order by 1;
