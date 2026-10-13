-- ============================================================================
--  Mindful Beginnings — instructor milestone dismissals
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates public.milestone_acks. One row per instructor stores the
--       highest milestone the admin has dismissed (5, 10, 15, 20, ...).
--       A later milestone is a higher number, so the dashboard alert
--       shows again until that new number is dismissed.
--    2. Enables row level security. The public anon key cannot read or
--       write this table. The admin login (authenticated) can read and
--       upsert dismissals. Same access model as class_requests.
--
--  SAFE TO RE-RUN: yes. The table, grants, and policy are idempotent.
-- ============================================================================

create table if not exists public.milestone_acks (
  instructor_id text primary key,
  milestone int not null,
  acked_at timestamptz default now()
);

comment on table public.milestone_acks is
  'Highest instructor-milestone dismissal per instructor. Admin only. Anon has no access. A later milestone (10, 15, ...) is a higher number and shows again until dismissed.';

alter table public.milestone_acks enable row level security;

revoke all on table public.milestone_acks from public, anon;

grant select, insert, update, delete on table public.milestone_acks to authenticated;
grant select, insert, update, delete on table public.milestone_acks to service_role;

drop policy if exists "admin full access to milestone_acks" on public.milestone_acks;
create policy "admin full access to milestone_acks"
  on public.milestone_acks
  for all
  to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';
