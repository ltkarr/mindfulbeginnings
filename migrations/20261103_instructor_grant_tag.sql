-- ============================================================================
--  Show the grant tag on instructor job posts.
--
--  instructor_list_sessions is the only session read the instructor portal
--  uses. grant_tag is admin-only on the table, so the portal cannot select
--  it directly. This function already runs as security definer and returns
--  an explicit column list. Add grant_tag to that list. Private notes,
--  Zoom links, host phones, and WiFi stay off it.
--
--  SAFE TO RE-RUN: yes. It does not change session prices or session rows.
-- ============================================================================

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
           max_students_override, participants_expected,
           is_custom_job, is_virtual, is_hold, is_cancelled, cancel_reason,
           allow_waitlist, extra_dates, is_recurring, recur_pattern, recur_end_date,
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter,
           requires_spanish, host_address, grant_tag
    from public.sessions
  ) x;
end;
$$;

grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;
