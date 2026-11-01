-- ============================================================================
--  Public session list: city and state only
--
--  list_public_sessions is what anonymous visitors receive for the register
--  page. It used to include sessions.location (venue names, room numbers,
--  and sometimes a street). The list now returns city and state only.
--  location is always null. host_address is not selected.
--
--  get_session_by_code is the specific registration page. It returns the
--  venue name and the street address so a family who opened that session
--  can see where to go. The Zoom link stays on get_session_logistics.
--
--  SAFE TO RE-RUN: drops and recreates both functions, then re-grants.
-- ============================================================================

drop function if exists public.list_public_sessions();

create function public.list_public_sessions()
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
  extra_dates jsonb,
  state text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.code, s.course, s.date, s.time, s.city,
         null::text,
         s.is_virtual,
         s.price_override, s.max_students_override, s.created_at,
         s.external_registration_url, s.allow_waitlist, s.extra_dates,
         s.state
  from public.sessions s
  where coalesce(s.is_private, false) = false
    and s.has_host = false
    and coalesce(s.is_custom_job, false) = false
    and coalesce(s.is_cancelled, false) = false
    and coalesce(s.is_hold, false) = false
    and coalesce(s.org_handles_registration, false) = false
    and s.code is not null
    and s.date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
    and upper(s.code) !~ '^(CJ-|RUA-|SUN-|TWU-|GS-|GSFA-)'
  order by s.date, s.code;
$$;

drop function if exists public.get_session_by_code(text);

create function public.get_session_by_code(p_code text)
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
  instructor_id text,
  host_address text,
  zip text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.code, s.course, s.date, s.time,
         s.location,
         s.city, s.state,
         s.has_host, s.host_taken, s.owner_taught, s.max_students_override,
         s.price_override, s.is_virtual, s.is_cancelled, s.allow_waitlist,
         s.extra_dates, s.created_at, s.external_registration_url, s.instructor_id,
         s.host_address, s.zip
  from public.sessions s
  where s.code = p_code
    and coalesce(s.org_handles_registration, false) = false;
$$;

revoke all on function public.list_public_sessions() from public;
revoke all on function public.get_session_by_code(text) from public;

grant execute on function public.list_public_sessions() to anon, authenticated, service_role;
grant execute on function public.get_session_by_code(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
