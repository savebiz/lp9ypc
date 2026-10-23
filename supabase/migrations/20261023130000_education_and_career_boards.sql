-- ============================================================================
-- LP9 YPC — migration 8 (seed data only, 2026-10-23)
--   * Career path "Education & Research" (teachers, lecturers, researchers),
--     after member feedback asking for an education sector.
--   * Its community "Young Academics" (the member's suggested name).
--   * "Jobs & Career Moves", the general careers board from the think-tank review.
-- Idempotent: safe to re-run (already applied to the live database by the
-- tech lead on 2026-10-23; running it again changes nothing).
-- ============================================================================
insert into public.career_paths (name, slug, icon)
values ('Education & Research', 'education-research', '🎓')
on conflict (slug) do nothing;

insert into public.communities (slug, name, description, kind, career_path_id, icon)
select 'young-academics', 'Young Academics',
       'For teachers, lecturers, researchers and everyone building a career in education. Share opportunities, grants, research and teaching tips.',
       'career', cp.id, 'education-research'
  from public.career_paths cp
 where cp.slug = 'education-research'
on conflict (slug) do nothing;

insert into public.communities (slug, name, description, kind, career_path_id, icon)
values ('jobs-career-moves', 'Jobs & Career Moves',
        'Job hunting, interviews, CVs, promotions and switching careers. Ask, share what worked, and help each other move forward.',
        'interest', null, 'message-circle')
on conflict (slug) do nothing;
