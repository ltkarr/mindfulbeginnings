-- ============================================================================
--  Mindful Beginnings — per-session instructor pay hours
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.teaching_hours (numeric, null). Blank keeps the course
--       length from the app (Girl Scouts — First Aid Badge Workshop is 1 hour).
--       A 90-minute class is 1.5. Other sessions of that course are unchanged.
--    2. Adds sessions.paid_travel_hours (numeric, null). Blank keeps the usual
--       paid travel hour plus the extra 30 minutes. When set, instructor pay
--       for that session is that instructor's own hourly rate times
--       (teaching hours + paid travel hours). A Lead Teacher's rate is $75.
--       A flat instr_pay_override still wins.
--    3. Adds both columns to instructor_list_sessions so the instructor portal
--       can price the job. Pay stays off the public anon key, same as
--       instr_pay_override.
--
--  DOES NOT set teaching hours or paid travel hours on any session, including
--  IB-261105 and GSFA-261112.
--
--  SAFE TO RE-RUN: yes. Columns, checks, comments, and the function are
--  idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists teaching_hours numeric,
  add column if not exists paid_travel_hours numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_teaching_hours_nonnegative'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_teaching_hours_nonnegative
      check (teaching_hours is null or teaching_hours >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_paid_travel_hours_nonnegative'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_paid_travel_hours_nonnegative
      check (paid_travel_hours is null or paid_travel_hours >= 0);
  end if;
end $$;

comment on column public.sessions.teaching_hours is
  'Class length used for instructor pay, in hours. Null uses the course default. A 90-minute class is 1.5. Does not change other sessions of the same course.';

comment on column public.sessions.paid_travel_hours is
  'Extra paid travel time, in hours, at each instructor''s own hourly rate. Null keeps the usual travel hour plus 30 minutes. When set, pay is rate times (teaching hours + these hours), and a flat instr_pay_override still wins.';

-- The instructor portal reads its job board through instructor_list_sessions,
-- which selects an explicit column list. Add the two hour columns so a
-- session's pay settings reach the job board. Same column list as
-- migrations/20261017_spanish_flags.sql, plus these two.
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
           second_instructor_id, instr_pay_override, teaching_hours, paid_travel_hours,
           max_students_override,
           is_custom_job, is_virtual, is_hold, is_cancelled, cancel_reason,
           allow_waitlist, extra_dates, is_recurring, recur_pattern, recur_end_date,
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter,
           requires_spanish, host_address
    from public.sessions
  ) x;
end;
$$;

grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;
