-- ============================================================================
--  Mindful Beginnings: sessions privacy lockdown
--
--  Apply this migration first, then deploy the code that calls these
--  functions. The functions and the revoke commit together. Deploying the
--  code first makes register.html and instructor.html call functions that
--  are not there yet, so the public list, session-code registration, and
--  the instructor portal fail until the migration runs.
--
--  Confirmed on project evninlytzhtacanrguhx on 2026-10-13, before this
--  file was written. Do not use the draft types (uuid, timestamptz, numeric):
--    sessions.id                  text
--    sessions.date                text
--    sessions.time                text
--    sessions.created_at          bigint
--    sessions.price_override      integer
--    sessions.instructor_id       text
--    sessions.second_instructor_id text
--    sessions.extra_dates         jsonb
--    sessions.recur_end_date      date
--    instructors.pin              text
--  instructor_login matches "where i.pin = p_pin" and does not check
--  is_active. instructor_list_sessions copies that check.
--
--  Does not change prices, price_override values, or register_student.
--  Do not apply this file to production until the matching code is ready
--  to deploy immediately afterward.
-- ============================================================================

begin;

-- 1) Safe public list. Filters live in the function so anon never sees
--    private, host, custom, hold, cancelled, past, or ops-code rows.
create or replace function public.list_public_sessions()
returns table (
  id text,
  code text,
  course text,
  date text,
  "time" text,
  city text,
  location text,
  is_virtual boolean,
  price_override integer,
  max_students_override integer,
  created_at bigint,
  external_registration_url text,
  allow_waitlist boolean,
  extra_dates jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.code, s.course, s.date, s.time, s.city, s.location, s.is_virtual,
         s.price_override, s.max_students_override, s.created_at,
         s.external_registration_url, s.allow_waitlist, s.extra_dates
  from public.sessions s
  where coalesce(s.is_private, false) = false
    and s.has_host = false
    and coalesce(s.is_custom_job, false) = false
    and coalesce(s.is_cancelled, false) = false
    and coalesce(s.is_hold, false) = false
    and s.date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
    and upper(s.code) !~ '^(CJ-|RUA-|SUN-|TWU-|GS-|GSFA-)'
  order by s.date, s.code;
$$;

-- 2) Exact-code lookup. Private bookings stay reachable by code.
--    Host homes do not get a location. Street address and Zoom stay out
--    of this result; get_session_logistics returns them after registration.
create or replace function public.get_session_by_code(p_code text)
returns table (
  id text,
  code text,
  course text,
  date text,
  "time" text,
  location text,
  city text,
  state text,
  has_host boolean,
  host_taken boolean,
  owner_taught boolean,
  max_students_override integer,
  price_override integer,
  is_virtual boolean,
  is_cancelled boolean,
  allow_waitlist boolean,
  extra_dates jsonb,
  created_at bigint,
  external_registration_url text,
  instructor_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.code, s.course, s.date, s.time,
         case when s.has_host then null else s.location end,
         s.city, s.state,
         s.has_host, s.host_taken, s.owner_taught, s.max_students_override,
         s.price_override, s.is_virtual, s.is_cancelled, s.allow_waitlist,
         s.extra_dates, s.created_at, s.external_registration_url, s.instructor_id
  from public.sessions s
  where s.code = p_code;
$$;

-- 3) Street address and Zoom, only for the registrant who just saved.
--    registrations.contact is "email" or "email / phone".
create or replace function public.get_session_logistics(p_registration_id text, p_email text)
returns table (
  host_address text,
  zoom_link text,
  location text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.host_address, s.zoom_link, s.location
  from public.registrations r
  join public.sessions s on s.id = r.session_id
  where r.id = btrim(coalesce(p_registration_id, ''))
    and btrim(coalesce(p_email, '')) <> ''
    and position('@' in btrim(p_email)) > 1
    and lower(btrim(split_part(coalesce(r.contact, ''), '/', 1))) = lower(btrim(p_email));
$$;

-- 4) Instructor portal. PIN check is the same predicate instructor_login uses
--    (instructors.pin = p_pin, no is_active filter). A bad PIN raises instead
--    of returning the board.
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
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter
    from public.sessions
  ) x;
end;
$$;

revoke all on function public.list_public_sessions() from public;
revoke all on function public.get_session_by_code(text) from public;
revoke all on function public.get_session_logistics(text, text) from public;
revoke all on function public.instructor_list_sessions(text) from public;

grant execute on function public.list_public_sessions() to anon, authenticated, service_role;
grant execute on function public.get_session_by_code(text) to anon, authenticated, service_role;
grant execute on function public.get_session_logistics(text, text) to anon, authenticated, service_role;
grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;

-- 5) Lock the sessions table. Admin (authenticated) policy stays.
drop policy if exists "anon can read sessions" on public.sessions;
drop policy if exists "Public can read sessions" on public.sessions;

-- Column grants are separate from table grants. Clear both for anon.
do $$
declare
  r record;
begin
  for r in
    select column_name, privilege_type
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'sessions'
      and grantee = 'anon'
  loop
    execute format(
      'revoke %s (%I) on public.sessions from anon',
      r.privilege_type, r.column_name
    );
  end loop;
end $$;

revoke select on public.sessions from anon;
revoke all on public.sessions from anon;

-- 6) Other anon column privileges that name address, zoom, note, phone,
--    wifi, or email. Checked 2026-10-13. RLS on these tables has no anon
--    policy (authenticated only), and no public page reads them with the
--    anon key, so there is no replacement RPC. Admin keeps its
--    authenticated grants.
--      community_partner_payouts.notes
--      community_partners.email, notes, phone
--      equipment.notes
--      equipment_checkouts.notes
--      invoices.notes
--      partner_payouts.notes
--      partners.email, notes, phone
--    sessions.host_address and sessions.zoom_link are covered above.
revoke all on table public.community_partner_payouts from anon;
revoke all on table public.community_partners from anon;
revoke all on table public.equipment from anon;
revoke all on table public.equipment_checkouts from anon;
revoke all on table public.invoices from anon;
revoke all on table public.partner_payouts from anon;
revoke all on table public.partners from anon;

commit;
