-- ============================================================================
--  Safe & Ready Families grant answers (Parts A, B, and C)
--  Run in the Supabase SQL editor if this has not been applied yet.
--
--  One row is one submitted part. Part A is the registration questions.
--  Part B is the class-day survey. Part C is the 60-day follow-up.
--  Families submit through /api/evaluations/submit (service role).
--  The admin login can read the rows for the grant report. Anon cannot.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

create table if not exists public.srf_grant_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  part text not null check (part in ('A', 'B', 'C')),
  session_id text,
  session_code text,
  session_date date,
  email text,
  registration_id text,
  answers jsonb not null
);

create index if not exists srf_grant_responses_part_idx
  on public.srf_grant_responses (part, session_code);

alter table public.srf_grant_responses enable row level security;

revoke all on table public.srf_grant_responses from public, anon, authenticated;

grant select on table public.srf_grant_responses to authenticated;

drop policy if exists "admin read srf_grant_responses" on public.srf_grant_responses;
create policy "admin read srf_grant_responses"
  on public.srf_grant_responses
  for select
  to authenticated
  using (true);
