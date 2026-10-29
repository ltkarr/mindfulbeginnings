-- ============================================================================
--  Mindful Beginnings — Girl Scout troop level on the packing list
--
--  WHAT THIS DOES:
--    1. Adds sessions.troop_level (nullable text). Values used by the admin
--       are daisy, brownie, junior, cadette, senior, and ambassador.
--       Null means Lindsay has not chosen one. The packing list can still
--       read a badge or troop name in the notes.
--    2. Does not grant the column to anon or public.
--    3. Grants SELECT, INSERT, and UPDATE to authenticated (the admin login).
--    4. Fills upcoming sessions when the course, troop name, or notes name
--       exactly one level. "Brownie First Aid" becomes brownie. Two different
--       levels in the same text are left blank.
--
--  SAFE TO RE-RUN: the column add is idempotent. The backfill only writes
--  rows that are still null, and only sessions dated today or later.
-- ============================================================================

alter table public.sessions
  add column if not exists troop_level text;

comment on column public.sessions.troop_level is
  'Girl Scout troop level: daisy, brownie, junior, cadette, senior, or ambassador. Null means not chosen. Do not grant to anon or public.';

revoke select (troop_level), insert (troop_level), update (troop_level), references (troop_level)
  on table public.sessions from anon, public;

grant select (troop_level), insert (troop_level), update (troop_level)
  on table public.sessions to authenticated;

-- Word boundaries are \y in Postgres. \b is a backspace.
update public.sessions
set troop_level = 'daisy'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\ydais(?:y|ies)\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:brownies?|juniors?|cadettes?|seniors?|ambassadors?)\y';

update public.sessions
set troop_level = 'brownie'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\ybrownies?\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:dais(?:y|ies)|juniors?|cadettes?|seniors?|ambassadors?)\y';

update public.sessions
set troop_level = 'junior'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\yjuniors?\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:dais(?:y|ies)|brownies?|cadettes?|seniors?|ambassadors?)\y';

update public.sessions
set troop_level = 'cadette'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\ycadettes?\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:dais(?:y|ies)|brownies?|juniors?|seniors?|ambassadors?)\y';

update public.sessions
set troop_level = 'senior'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\yseniors?\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:dais(?:y|ies)|brownies?|juniors?|cadettes?|ambassadors?)\y';

update public.sessions
set troop_level = 'ambassador'
where troop_level is null
  and coalesce(is_cancelled, false) = false
  and date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) ~* '\yambassadors?\y'
  and concat_ws(' ', course, code, bill_to_org, notes, admin_private_notes) !~* '\y(?:dais(?:y|ies)|brownies?|juniors?|cadettes?|seniors?)\y';

notify pgrst, 'reload schema';
