-- ============================================================================
--  Instructor directions, separate from private notes and client financials.
--  Run in the Supabase SQL editor after this code is deployed, or in the
--  same release window. Until this runs, instructor_session_notes still
--  returns sessions.notes and instructor_get_roster still returns
--  registration notes and pay_status.
--
--  WHAT THIS DOES:
--    1. Adds sessions.instructor_directions. This is the only new note
--       instructors may see (parking, arrival, what to bring). It is empty
--       for existing rows. This script does not copy sessions.notes or
--       admin_private_notes into it.
--    2. instructor_list_sessions returns that column and stops returning
--       grant_tag. Instructor pay columns stay, because they are the
--       instructor's own compensation. Client prices, private notes, and
--       billing columns stay off the list.
--    3. instructor_session_notes returns instructor_directions only.
--       A valid PIN can no longer read sessions.notes through this function.
--    4. instructor_job_details no longer returns job_data.notes. Pay status,
--       pay date, the fee paid, and a referral bonus stay. Those are the
--       instructor's own payout record.
--    5. instructor_get_roster no longer returns registration notes or
--       pay_status. A couple's name is returned only from the [Partner: ]
--       tag the registration form writes. The rest of the note stays in
--       the database and is not part of the result.
--
--  Does not update session rows, prices, payroll, or any host-rate agreement.
--  Does not grant the new column to anon. Does not GRANT anything on
--  job_data. job_data has an anon_read_job_board policy with USING (true),
--  but anon has no table privilege. Granting SELECT to anon would turn
--  that policy on. Leave it alone.
--
--  instructor_info stays on the instructor list. It is the older
--  instructor-directions column and can also contain the instructor's own
--  pay instructions. It is not a client price, and this script does not
--  redact it. instr_pay_override, teaching_hours, paid_travel_hours,
--  pay_status, pay_date, paid_fee, and referral_bonus stay for the same
--  reason: they are the instructor's own compensation, not a client bill.
--  grant_tag is a subsidy label and comes off the instructor list.
--
--  sessions RLS is enabled and not forced. The authenticated policy is
--  USING (true), so every authenticated role can read private columns.
--  In this app only admin.html calls signInWithPassword, and the project
--  currently has one Auth user. That is not a database guarantee. This
--  script does not replace that policy.
--
--  SAFE TO RE-RUN: the column add and grants are idempotent. The functions
--  are replaced. instructor_get_roster and instructor_session_notes are
--  dropped first because their result columns change.
-- ============================================================================

alter table public.sessions
  add column if not exists instructor_directions text;

comment on column public.sessions.instructor_directions is
  'Directions instructors may see: parking, arrival, room, what to bring. Not session notes and not payment agreements. Do not grant this column to anon.';

revoke select (instructor_directions), insert (instructor_directions), update (instructor_directions), references (instructor_directions)
  on table public.sessions from anon, public;

grant select (instructor_directions), insert (instructor_directions), update (instructor_directions)
  on table public.sessions to authenticated;

-- Notes stay admin-only on the table. The functions below are what used to
-- bypass that grant.
revoke select (notes), insert (notes), update (notes), references (notes)
  on table public.sessions from anon, public;

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
           extra_days, closures, instructor_info, instructor_directions,
           requires_rn, requires_safe_sitter, requires_spanish, host_address
    from public.sessions
  ) x;
end;
$$;

revoke all on function public.instructor_list_sessions(text) from public;
grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;

drop function if exists public.instructor_session_notes(text);

create function public.instructor_session_notes(p_pin text)
returns table (
  session_id text,
  instructor_directions text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.instructors i
    where i.pin = p_pin
      and coalesce(i.is_active, true)
  ) then
    return;
  end if;

  return query
  select s.id, s.instructor_directions
  from public.sessions s;
end;
$$;

revoke all on function public.instructor_session_notes(text) from public;
grant execute on function public.instructor_session_notes(text) to anon, authenticated;

drop function if exists public.instructor_job_details(text);

create function public.instructor_job_details(p_pin text)
returns table (
  session_id text,
  materials_method text,
  materials_sent boolean,
  eval_received boolean,
  pay_status text,
  pay_date text,
  referral_bonus numeric,
  paid_fee numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  select i.id into v_id
  from public.instructors i
  where i.pin = p_pin
    and coalesce(i.is_active, true)
  limit 1;
  if v_id is null then
    return;
  end if;

  return query
  select j.session_id,
         j.materials_method,
         coalesce(j.materials_sent, false),
         coalesce(j.eval_received, false),
         j.pay_status,
         j.pay_date,
         j.referral_bonus,
         j.paid_fee
  from public.job_data j
  where j.instructor_id = v_id;
end;
$$;

revoke all on function public.instructor_job_details(text) from public;
grant execute on function public.instructor_job_details(text) to anon, authenticated;

drop function if exists public.instructor_get_roster(text, text);

create function public.instructor_get_roster(p_pin text, p_session_id text)
returns table (
  student_name text,
  grade text,
  parent_name text,
  contact text,
  cpr_permission text,
  emergency_auth text,
  waiver_signed boolean,
  partner_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_id text;
begin
  select i.id into v_instructor_id
  from public.instructors i
  where i.pin = p_pin
  limit 1;
  if v_instructor_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.job_data j
    where j.session_id = p_session_id
      and j.instructor_id = v_instructor_id
  ) then
    return;
  end if;

  return query
  select r.student_name,
         r.grade,
         r.parent_name,
         r.contact,
         r.cpr_permission,
         r.emergency_auth,
         r.waiver_signed,
         nullif(btrim((regexp_match(r.notes, '\[Partner:\s*([^\]]+)\]', 'i'))[1]), '')
  from public.registrations r
  where r.session_id = p_session_id;
end;
$$;

revoke all on function public.instructor_get_roster(text, text) from public;
grant execute on function public.instructor_get_roster(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
