-- Let the public registration page see whether a class is the Spanish
-- session, so Safe & Ready Families can show the Spanish form.
-- Same return shape as 20261102_county_disclaimer.sql, plus requires_spanish.
-- SAFE TO RE-RUN: yes.

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
  zip text,
  county_disclaimer boolean,
  requires_spanish boolean
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
         s.host_address, s.zip,
         public.session_county_disclaimer(s.county_disclaimer, s.location, s.host_address, s.city),
         coalesce(s.requires_spanish, false)
  from public.sessions s
  where s.code = p_code
    and coalesce(s.org_handles_registration, false) = false;
$$;

revoke all on function public.get_session_by_code(text) from public;
grant execute on function public.get_session_by_code(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
