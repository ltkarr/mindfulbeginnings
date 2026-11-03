-- ============================================================================
--  Mindful Beginnings — admin settings (key/value)
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates public.admin_settings, a tiny key/value table for admin
--       preferences that must follow Lindsay across devices. First use:
--       the 30-day cash forecast's "in the account now" balance, stored
--       under the key 'cash_balance' (previously kept only in each
--       browser's localStorage, so phone and computer disagreed and an
--       edit could be lost when the dashboard refreshed mid-typing).
--    2. Enables row level security. The public anon key cannot read or
--       write this table. The admin login (authenticated) can read and
--       upsert settings. Same access model as class_requests and
--       milestone_acks.
--
--  SAFE TO RE-RUN: yes. The table, grants, and policy are idempotent.
-- ============================================================================

create table if not exists public.admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

comment on table public.admin_settings is
  'Admin key/value settings that sync across devices (e.g. cash_balance for the 30-day cash forecast). Admin only. Anon has no access.';

alter table public.admin_settings enable row level security;

revoke all on table public.admin_settings from public, anon;

grant select, insert, update, delete on table public.admin_settings to authenticated;
grant select, insert, update, delete on table public.admin_settings to service_role;

drop policy if exists "admin full access to admin_settings" on public.admin_settings;
create policy "admin full access to admin_settings"
  on public.admin_settings
  for all
  to authenticated
  using (true)
  with check (true);
