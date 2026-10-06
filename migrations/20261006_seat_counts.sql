-- Seat counts used by the public registration page and the instructor portal.
-- A cancelled, waitlisted, or refunded row does not take a seat. Host rows still do.
-- register_student already uses this same exclusion. This makes the displayed
-- count match the cap the server enforces.
-- Safe to run more than once.

create or replace function public.get_registration_count(p_session_id text)
returns integer
language sql
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.registrations
  where session_id = p_session_id
    and lower(coalesce(pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded');
$$;

create or replace function public.get_all_registration_counts()
returns table(session_id text, cnt integer)
language sql
security definer
set search_path to 'public'
as $$
  select r.session_id, count(*)::int
  from public.registrations r
  where lower(coalesce(r.pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded')
  group by r.session_id;
$$;

-- Names of instructors waiting on one job. The instructor portal calls this with
-- the signed-in PIN when a job is handed back, and puts the names in the email
-- Lindsay already receives. It does not return phones, PINs, or pay details.
create or replace function public.get_waitlist_contacts(p_pin text, p_session_id text)
returns table(name text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id text;
begin
  if p_pin is null or length(btrim(p_pin)) < 4 or p_session_id is null then
    return;
  end if;
  select i.id into v_id
  from public.instructors i
  where i.pin = btrim(p_pin)
    and coalesce(i.is_active, true)
  limit 1;
  if v_id is null then
    return;
  end if;
  return query
  select i.name
  from public.instructors i
  where i.id in (
    select jsonb_array_elements_text(coalesce(j.waitlist, '[]'::jsonb))
    from public.job_data j
    where j.session_id = p_session_id
  )
  order by i.name;
end;
$$;

revoke all on function public.get_waitlist_contacts(text, text) from public;
grant execute on function public.get_waitlist_contacts(text, text) to anon, authenticated;
