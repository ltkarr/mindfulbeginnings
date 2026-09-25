-- ============================================================================
--  Mindful Beginnings — admin-only private notes on a session
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.admin_private_notes (nullable text).
--       This is Lindsay's private note on a session or custom job. It is
--       separate from sessions.notes, which instructors already see on the
--       job board and in the instructor reminder email.
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
--  Instructor RPCs (instructor_session_private, get_tomorrow_reminders, and
--  the rest) select named columns and do not return this one. Do not add it
--  to those functions or to any anon column list.
--
--  SAFE TO RE-RUN: yes. The column add and grants are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists admin_private_notes text;

comment on column public.sessions.admin_private_notes is
  'Admin-only notes. Do not grant this column to anon or public. Instructor portal queries, public registration, reminder emails, and instructor RPCs must not select it.';

-- Column form only. A table-level REVOKE SELECT from anon would also wipe the
-- existing per-column grants the instructor portal and register page rely on.
revoke select (admin_private_notes), insert (admin_private_notes), update (admin_private_notes), references (admin_private_notes)
  on table public.sessions from anon, public;

grant select (admin_private_notes), insert (admin_private_notes), update (admin_private_notes)
  on table public.sessions to authenticated;

notify pgrst, 'reload schema';
