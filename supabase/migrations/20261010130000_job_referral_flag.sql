-- ============================================================================
-- LP9 YPC — migration 4: referral flag on jobs (2026-10-10)
-- Admins tick "This is a referral link" when a job's Apply link is a referral
-- (e.g. Micro1, Turing). Members then see a small "Referral link via YPC" note.
-- Idempotent: safe to re-run. Jobs' existing RLS (admins write) applies.
-- ============================================================================
alter table public.jobs add column if not exists is_referral boolean not null default false;
