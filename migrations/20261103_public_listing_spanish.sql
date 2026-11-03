-- Public class cards need to know when a session is taught in Spanish.
-- Same return shape as 20261102_county_disclaimer.sql, plus requires_spanish.
-- SAFE TO RE-RUN: yes.

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
  state text,
  county_disclaimer boolean,
  requires_spanish boolean
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
         s.state,
         public.session_county_disclaimer(s.county_disclaimer, s.location, s.host_address, s.city),
         coalesce(s.requires_spanish, false)
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

revoke all on function public.list_public_sessions() from public;
grant execute on function public.list_public_sessions() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
