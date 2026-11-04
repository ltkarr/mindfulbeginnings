-- ============================================================================
--  Montgomery County disclaimer: show only when explicitly turned on
--
--  sessions.county_disclaimer = true shows the line on public registration.
--  False and null hide it. The old school / Edgemoor keyword rule is retired.
--
--  list_public_sessions and get_session_by_code already return
--  session_county_disclaimer(...). Replacing this function changes both.
--  The location arguments stay so those functions keep the same signature.
--  Anon is still not granted the sessions.county_disclaimer column.
--
--  This file does not update any session rows. Safe & Ready Families
--  (SRF-270123, SRF-270216, SRF-270313, SRF-270413) are stored with
--  county_disclaimer null, and their library names do not match the old
--  keyword rule, so registration does not show the line for them today.
--  To turn those four on, run the commented update at the bottom by hand.
--
--  SAFE TO RE-RUN.
-- ============================================================================

comment on column public.sessions.county_disclaimer is
  'True shows the Montgomery County disclaimer on registration. False and null hide it.';

create or replace function public.session_county_disclaimer(
  p_flag boolean,
  p_location text,
  p_host_address text,
  p_city text
) returns boolean
language sql
immutable
as $$
  -- Location arguments are unused. Only an explicit true shows the line.
  select p_flag is true;
$$;

revoke all on function public.session_county_disclaimer(boolean, text, text, text) from public;

notify pgrst, 'reload schema';

-- Manual data update, not applied by this file. Run only if those four
-- Safe & Ready Families sessions should show the line:
--
-- update public.sessions
-- set county_disclaimer = true
-- where code in ('SRF-270123', 'SRF-270216', 'SRF-270313', 'SRF-270413');
