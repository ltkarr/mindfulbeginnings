-- ============================================================================
--  Mindful Beginnings — grant tag on sessions
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Adds sessions.grant_tag (nullable text). Admin tags a session with a
--    grant (first value: 'dd-council-2027', the Maryland Developmental
--    Disabilities Council Family Safety Toolkit award). The Finances screen
--    then draws that session's instructor pay and linked expenses down
--    against the grant award, separately from regular class money.
--
--    Does not grant the column to anon or public. The register page and the
--    instructor portal never read it; it is admin-only, like org_portion.
--    Authenticated (the admin login) is granted the column explicitly, which
--    keeps admin reads and saves working if table grants are ever narrowed.
--
--  SAFE TO RE-RUN: yes. The column add and grants are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists grant_tag text;

comment on column public.sessions.grant_tag is
  'Grant this session is funded by (e.g. dd-council-2027). Null means regular class money. Admin only; public pages do not read this column.';

-- Column form only. A table-level REVOKE SELECT from anon would also wipe the
-- existing per-column grants the instructor portal and register page rely on.
revoke select (grant_tag), insert (grant_tag), update (grant_tag), references (grant_tag)
  on table public.sessions from anon, public;

grant select (grant_tag), insert (grant_tag), update (grant_tag)
  on table public.sessions to authenticated;

notify pgrst, 'reload schema';
