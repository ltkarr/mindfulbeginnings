-- ============================================================================
--  Mindful Beginnings — dismissed duplicate-session pairs
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Creates public.duplicate_dismissals. One row is one pair of sessions
--    Lindsay has marked as real ("These are both real, stop flagging").
--    pair_key is the two session ids sorted and joined, so the same pair
--    cannot be stored twice and the warning stays gone on every device.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

create table if not exists public.duplicate_dismissals (
  pair_key text primary key,
  session_a text not null,
  session_b text not null,
  dismissed_at timestamptz not null default now()
);

comment on table public.duplicate_dismissals is
  'Admin dismissal of a possible duplicate pair, keyed on the two session ids. Anon has no access.';

alter table public.duplicate_dismissals enable row level security;

revoke all on table public.duplicate_dismissals from public, anon;

grant select, insert, update, delete on table public.duplicate_dismissals to authenticated;
grant select, insert, update, delete on table public.duplicate_dismissals to service_role;

drop policy if exists "admin full access to duplicate_dismissals" on public.duplicate_dismissals;
create policy "admin full access to duplicate_dismissals"
  on public.duplicate_dismissals
  for all
  to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';
