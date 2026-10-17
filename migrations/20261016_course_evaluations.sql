-- ============================================================================
--  Mindful Beginnings — native course evaluation submissions
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates public.course_evaluations. One row is a family's submitted
--       program evaluation from the hidden course-evaluation.html page.
--       Questions match the retired Google Form: course, instructor,
--       whether date/time/location info was clear, whether the instructor
--       was ready on time, 1-5 ratings (registration ease, instructor
--       engagement, safe learning environment, likelihood to recommend),
--       best part, and improvement area. session_date is optional and lets
--       Lindsay tie feedback to a specific class session.
--    2. Enables row level security. The public anon key cannot read or write
--       this table. Families submit through /api/evaluations/submit, which
--       uses the service role. The admin login (authenticated) can read and
--       delete rows (delete is for spam/test submissions).
--
--  SAFE TO RE-RUN: yes. The table, grants, and policies are idempotent.
-- ============================================================================

create table if not exists public.course_evaluations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  course text not null,
  instructor text not null,
  session_date date,
  info_clear boolean,
  ready_on_time boolean,
  registration_ease smallint check (registration_ease between 1 and 5),
  instructor_engagement smallint check (instructor_engagement between 1 and 5),
  safe_environment smallint check (safe_environment between 1 and 5),
  recommend_likelihood smallint check (recommend_likelihood between 1 and 5),
  best_part text,
  improvements text
);

alter table public.course_evaluations enable row level security;

revoke all on table public.course_evaluations from public, anon;

grant select, delete on table public.course_evaluations to authenticated;

drop policy if exists "admin read course_evaluations" on public.course_evaluations;
create policy "admin read course_evaluations"
  on public.course_evaluations
  for select
  to authenticated
  using (true);

drop policy if exists "admin delete course_evaluations" on public.course_evaluations;
create policy "admin delete course_evaluations"
  on public.course_evaluations
  for delete
  to authenticated
  using (true);
