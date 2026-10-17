-- ============================================================================
--  Mindful Beginnings — Spanish-language job flag
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.requires_spanish (boolean, default false). A job ticked
--       "Requires Spanish-speaking instructor" in admin — or requested in
--       Spanish on the home-host / organization form — is only visible to
--       (and assignable to, without a warning) instructors flagged as
--       Spanish speakers. Same pattern as requires_rn / requires_safe_sitter.
--    2. Adds instructors.speaks_spanish (boolean, default false). Lindsay
--       ticks it on the instructor's card in admin.
--    3. Adds the instructor_speaks_spanish(p_pin) helper RPC so the
--       instructor portal can read the flag even if the deployed
--       instructor_login predates the column (same shape as
--       instructor_is_rn / instructor_lead_teacher).
--    4. Adds sessions.host_address to instructor_list_sessions so the Open
--       Jobs board can show the full street address before acceptance.
--       (Lindsay 2026-10-17: instructors will not accept a job without
--       knowing exactly where it is. Host cell, day-of contact, and WiFi
--       stay behind the post-acceptance private RPC.)
--
--  SAFE TO RE-RUN: yes. Columns, function, and grants are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists requires_spanish boolean default false;

comment on column public.sessions.requires_spanish is
  'Job must be taught in Spanish. Only instructors flagged speaks_spanish see it on Open Jobs.';

-- The portal and register page read sessions through the anon key; the new
-- column needs the same per-column grant the other requirement flags have.
grant select (requires_spanish) on public.sessions to anon;

alter table public.instructors
  add column if not exists speaks_spanish boolean default false;

comment on column public.instructors.speaks_spanish is
  'Instructor can teach in Spanish. Set by the admin on the Instructors tab.';

-- Helper RPC for the instructor portal (PIN-authenticated, anon key).
-- Same shape as instructor_is_rn / instructor_lead_teacher.
create or replace function public.instructor_speaks_spanish(p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(speaks_spanish, false)
  from public.instructors
  where pin::text = p_pin
  limit 1;
$$;

grant execute on function public.instructor_speaks_spanish(text) to anon, authenticated;

-- The instructor portal reads its job board through instructor_list_sessions,
-- which selects an explicit column list. Add requires_spanish so Spanish-only
-- jobs carry the flag to the portal (same as requires_rn / requires_safe_sitter).
create or replace function public.instructor_list_sessions(p_pin text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile json;
begin
  select (to_jsonb(i) - 'pin')::json
    into v_profile
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_profile is null then
    raise exception 'invalid pin';
  end if;

  return query
  select to_jsonb(x) from (
    select id, code, course, date, "time", location, city, state, zip,
           owner_taught, host_taken, has_host, instructor_id,
           second_instructor_id, instr_pay_override, max_students_override,
           is_custom_job, is_virtual, is_hold, is_cancelled, cancel_reason,
           allow_waitlist, extra_dates, is_recurring, recur_pattern, recur_end_date,
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter,
           requires_spanish, host_address
    from public.sessions
  ) x;
end;
$$;

grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;
