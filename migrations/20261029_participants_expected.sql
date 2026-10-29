-- ============================================================================
--  Mindful Beginnings — participants expected, for the packing list
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.participants_expected (nullable integer, no default).
--       This is the number Lindsay is packing for when it is not the same as
--       who has registered yet. Null means she has not typed one. The packing
--       list can still read a host request, an organization roster, or the notes.
--    2. Does not grant the column to anon or public. Anon SELECT on sessions
--       is column-level. A new column with no grant stays off the instructor
--       portal, the public register page, and anyone holding the anon key.
--    3. Grants SELECT, INSERT, and UPDATE on this column to authenticated,
--       which is the admin login.
--    4. Fills the column for upcoming classes where the count is already in
--       the organization roster, the notes, or the capacity of a private
--       home host session. A public course cap is not copied. A range such
--       as "4-6" or "8–10 moms" uses the higher number.
--
--  SAFE TO RE-RUN: the column add is idempotent. The backfill only writes
--  rows that are still null, and only sessions dated today or later.
-- ============================================================================

alter table public.sessions
  add column if not exists participants_expected integer;

comment on column public.sessions.participants_expected is
  'How many participants to pack for. Null means not typed in. Do not grant to anon or public.';

revoke select (participants_expected), insert (participants_expected), update (participants_expected), references (participants_expected)
  on table public.sessions from anon, public;

grant select (participants_expected), insert (participants_expected), update (participants_expected)
  on table public.sessions to authenticated;

-- Upcoming only. Today is America/New_York, the same clock as the public list.
-- Organization roster first. Then a labeled count in the notes, including a
-- range. Then "about N students expected", a tilde count, or "8–10 moms".
-- Last, the capacity typed on a private home host session.

update public.sessions
set participants_expected = billed_headcount
where participants_expected is null
  and billed_headcount is not null
  and billed_headcount > 0
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD');

update public.sessions s
set participants_expected = sub.n
from (
  select id,
    greatest(
      (regexp_match(notes, 'Expected participants:\s*(\d+)', 'i'))[1]::int,
      coalesce((regexp_match(notes, 'Expected participants:\s*\d+\s*[-–]\s*(\d+)', 'i'))[1]::int, 0)
    ) as n
  from public.sessions
  where participants_expected is null
    and coalesce(notes, '') ~* 'Expected participants:\s*\d+'
    and coalesce(is_cancelled, false) = false
    and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
) sub
where s.id = sub.id
  and sub.n between 1 and 80;

update public.sessions
set participants_expected = (regexp_match(notes, 'about\s+(\d+)\s+students expected', 'i'))[1]::int
where participants_expected is null
  and coalesce(notes, '') ~* 'about\s+\d+\s+students expected'
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD');

update public.sessions
set participants_expected = (regexp_match(notes, '(\d+)\s*[-–—]\s*(\d+)\s+(moms|kids|children|students|participants|girls|scouts|brownies)', 'i'))[2]::int
where participants_expected is null
  and coalesce(notes, '') ~* '\d+\s*[-–—]\s*\d+\s+(moms|kids|children|students|participants|girls|scouts|brownies)'
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD');

update public.sessions
set participants_expected = max_students_override
where participants_expected is null
  and has_host = true
  and max_students_override is not null
  and max_students_override > 0
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD');

notify pgrst, 'reload schema';
