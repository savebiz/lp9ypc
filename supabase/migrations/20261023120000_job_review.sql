-- ============================================================================
-- LP9 YPC — migration 7: job review that keeps up (2026-10-23)
-- Approved by Victor with the think-tank recommendations (2026-10-23):
--   * jobs.relevance  0-100 score set by the job finder (higher = more useful
--     to LP9 members: open to Nigerian applicants, matches a career path
--     members follow). The review queue sorts by it.
--   * jobs.reject_reason  why a job was rejected (admin or automatic), so we
--     can measure each source's quality.
--   * jobs.reviewed_at   when a person or the auto-expiry decided.
-- Idempotent: safe to re-run. Run AFTER migrations 1-6. No new policies:
-- jobs keep their existing RLS (admins write; the public reads approved jobs).
-- ============================================================================

alter table public.jobs add column if not exists relevance    smallint;
alter table public.jobs add column if not exists reject_reason text;
alter table public.jobs add column if not exists reviewed_at  timestamptz;

do $$ begin
  alter table public.jobs add constraint jobs_relevance_range check (relevance is null or relevance between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.jobs add constraint jobs_reject_reason_values
    check (reject_reason is null or reject_reason in ('expired', 'not_eligible', 'duplicate', 'irrelevant', 'broken_link', 'other'));
exception when duplicate_object then null; end $$;

-- The review queue: pending jobs, best first, newest first within a score.
create index if not exists jobs_review_queue_idx
  on public.jobs (review_status, relevance desc nulls last, created_at desc);

-- Per-source pending counts (the job finder caps each source's waiting jobs).
create index if not exists jobs_source_status_idx on public.jobs (source_id, review_status);
