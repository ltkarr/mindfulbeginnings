-- ============================================================================
--  Mindful Beginnings — mark an organization bill or custom-job fee received
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.fee_received (nullable boolean, no default).
--       True means Lindsay has marked the organization bill or custom-job
--       fee as received (check, Zelle, or transfer). False means she has
--       explicitly marked it not received. Null means not marked.
--       Family registration payments are not this column. A hold note that
--       already says paid, deposited, received, or collected still counts
--       while the column is null. This script does not update existing rows.
--    2. Does not grant the column to anon or public. Anon SELECT on sessions
--       is column-level (the table ACL has no SELECT for anon). A new column
--       with no grant is invisible to the instructor portal, the public
--       register page, and anyone holding the anon key — including select=*.
--    3. Grants SELECT, INSERT, and UPDATE on this column to authenticated,
--       which is the admin login. Authenticated already has table-level
--       access, so admin can read and save the column as soon as it exists.
--       The explicit column grant keeps that true if table grants are later
--       narrowed to a column list.
--
--  Instructor RPCs and the public column lists must not select this column.
--
--  SAFE TO RE-RUN: yes. The column add and grants are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists fee_received boolean;

comment on column public.sessions.fee_received is
  'True when the organization bill or custom-job fee has been received. Null means not marked. Family registration payments are not this column. Do not grant to anon or public.';

-- Column form only. A table-level REVOKE SELECT from anon would also wipe the
-- existing per-column grants the instructor portal and register page rely on.
revoke select (fee_received), insert (fee_received), update (fee_received), references (fee_received)
  on table public.sessions from anon, public;

grant select (fee_received), insert (fee_received), update (fee_received)
  on table public.sessions to authenticated;

notify pgrst, 'reload schema';
