-- Instructor onboarding quiz results (instructor-onboarding.html).
-- The page POSTs to /api/evaluations/submit with form: 'onboarding'
-- (the two public form endpoints share one Vercel function), which inserts
-- with the service
-- role. Admin reads (and can delete) rows through the authenticated client.
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists public.onboarding_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  instructor_name text not null,
  instructor_email text not null,
  score smallint not null check (score >= 0),
  total smallint not null check (total >= 1),
  passed boolean not null default false,
  answers jsonb
);

alter table public.onboarding_results enable row level security;

revoke all on table public.onboarding_results from public, anon;

grant select, delete on table public.onboarding_results to authenticated;

drop policy if exists "admin read onboarding_results" on public.onboarding_results;
create policy "admin read onboarding_results"
  on public.onboarding_results
  for select
  to authenticated
  using (true);

drop policy if exists "admin delete onboarding_results" on public.onboarding_results;
create policy "admin delete onboarding_results"
  on public.onboarding_results
  for delete
  to authenticated
  using (true);
