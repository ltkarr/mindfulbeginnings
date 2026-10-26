-- Instructor job board: host headcount and the private flag.
-- instructor_list_sessions selects an explicit column list. Without these
-- columns the portal cannot tell a troop headcount from "0 students registered",
-- and it cannot tell a private org class from a public one.
--
-- Does not change prices, pay, or any session row.
-- Private admin notes, the host phone, and WiFi stay off this list.

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
           requires_spanish, host_address,
           is_private, org_handles_registration, billed_headcount, bill_to_org, price_override
    from public.sessions
  ) x;
end;
$$;

grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;
