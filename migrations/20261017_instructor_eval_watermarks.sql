-- ============================================================================
--  Mindful Beginnings — instructor evaluation report watermarks
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Creates public.instructor_eval_watermarks. One row per instructor tracks
--    how many completed classes have already been included in a Monday
--    evaluation report, and how many $5/hr raises have been granted, so the
--    weekly /api/cron/instructor-eval-report job only reports each 5-class
--    milestone once and never double-counts a raise.
--
--  ACCESS: service role only (the cron API route). No anon/authenticated
--    access; the admin UI does not read this table.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

create table if not exists public.instructor_eval_watermarks (
  instructor_id uuid primary key references public.instructors(id) on delete cascade,
  classes_reported integer not null default 0,
  raises_given integer not null default 0,
  last_reported_at timestamptz
);

alter table public.instructor_eval_watermarks enable row level security;

revoke all on table public.instructor_eval_watermarks from public, anon;
