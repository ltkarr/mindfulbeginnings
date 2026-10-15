-- Organization registration: the organization signs people up itself.
-- Public registration limit is 0. The session stays off public listings,
-- get_session_by_code returns nothing, and register_student refuses every
-- public insert (including host, waitlist, and comp tokens).
-- Class capacity (max_students_override) and the organization invoice
-- (billed_headcount, org_portion, price_override) are not changed.
--
-- sessions.code is unique and was NOT NULL. Organization-registration
-- sessions store no code. Postgres unique allows many nulls.
--
-- Existing rows flagged below (code cleared in the same update):
--   Congregation Beth El classes:
--     SAH-1016, SS-1016, SAH-1102, SR-1102, SS-261102, AKW-1103,
--     CR-1215, CR-0119, SR-0119, IB-270125, SAH-0125, AKW-0309,
--     SAH-0412, SR-0412, SS-0412, CR-0413
--   Cancelled Beth El custom jobs: CJ-1102, CJ-1103
--   School programs (Creative Enrichment, Enrichment Collective, Lab School):
--     SS-NORW-F26, LM-BGES-W27, CJ-0916, CJ-0916-2, CJ-0914, CJ-0914-2,
--     CJ-0915, CJ-0915-2, CJ-0917, CJ-0925, CJ-0910, CJ-0910-2
-- Girl Scout troop private links are not in that list. GSFA-270303
-- (Troop 37234) keeps its code and stays registrable.

alter table public.sessions
  add column if not exists org_handles_registration boolean not null default false;

alter table public.sessions alter column code drop not null;

update public.sessions
   set org_handles_registration = true,
       code = null
 where code in (
    'SAH-1016', 'SS-1016', 'SAH-1102', 'SR-1102', 'SS-261102', 'AKW-1103',
    'CR-1215', 'CR-0119', 'SR-0119', 'IB-270125', 'SAH-0125', 'AKW-0309',
    'SAH-0412', 'SR-0412', 'SS-0412', 'CR-0413',
    'CJ-1102', 'CJ-1103',
    'SS-NORW-F26', 'LM-BGES-W27', 'CJ-0916', 'CJ-0916-2', 'CJ-0914', 'CJ-0914-2',
    'CJ-0915', 'CJ-0915-2', 'CJ-0917', 'CJ-0925', 'CJ-0910', 'CJ-0910-2'
  )
   and code !~ '^(GS-|GSFA-)'
   and coalesce(bill_to_org, '') !~* 'girl scout|troop';

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
    and coalesce(s.org_handles_registration, false) = false
    and s.code is not null
    and s.date >= to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
    and upper(s.code) !~ '^(CJ-|RUA-|SUN-|TWU-|GS-|GSFA-)'
  order by s.date, s.code;
$$;

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
  where s.code = p_code
    and coalesce(s.org_handles_registration, false) = false;
$$;

create or replace function public.register_student(p_row jsonb, p_max integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id text := nullif(btrim(coalesce(p_row->>'session_id', '')), '');
  v_student    text := nullif(btrim(coalesce(p_row->>'student_name', '')), '');
  v_requested  text := lower(btrim(coalesce(p_row->>'pay_status', '')));
  v_token      text := btrim(coalesce(p_row->>'registration_token', ''));
  v_status     text := 'pending';
  v_bypass     boolean := false;
  v_course     text;
  v_people_cap integer;
  v_per        integer;
  v_rows       integer;
  v_committed  integer;
  v_occupied   integer;
  v_clean      jsonb;
  v_has_host   boolean;
  v_host_taken boolean;
  v_allow_wl   boolean;
  v_cancelled  boolean;
  v_price      integer;
  v_org_reg    boolean;
begin
  if p_row is null or v_session_id is null or coalesce(p_row->>'id', '') = '' or v_student is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_row');
  end if;

  select s.course,
         s.max_students_override,
         coalesce(s.has_host, true),
         coalesce(s.host_taken, false),
         coalesce(s.allow_waitlist, true),
         coalesce(s.is_cancelled, false),
         s.price_override,
         coalesce(s.org_handles_registration, false)
    into v_course, v_people_cap, v_has_host, v_host_taken, v_allow_wl, v_cancelled, v_price, v_org_reg
  from public.sessions s
  where s.id = v_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_cancelled then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;
  -- Public registration limit is 0. Admin still rosters through its own insert.
  if v_org_reg then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if v_people_cap is null then
    v_people_cap := case v_course
      when 'Safe Sitter®' then 16
      when 'Safe Sitter® Babysitting Essentials' then 16
      when 'Intro to Babysitting' then 20
      when 'Safe@Home' then 16
      when 'Safe@Home — Series' then 16
      when 'Safe@Home — Virtual' then 16
      when 'Grandparents: Getting Started' then 16
      when 'Care Ready' then 16
      when 'Baby Ready' then 12
      when 'Baby Ready + CPR Certification' then 12
      when 'All Kids Welcome' then 20
      when 'Stay Ready: Choking Rescue and CPR' then 12
      when 'Campus Ready: Safety Skills for College Life' then 12
      when 'Steady and Ready' then 8
      when 'My First Babysitters Club' then 12
      when 'My First Babysitters Club — Single Session' then 12
      when 'Ready. Period.' then 18
      when 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes' then 20
      when 'Social Ready' then 20
      else 8
    end;
  end if;
  v_per := case when v_course in ('Baby Ready', 'Baby Ready + CPR Certification') then 2 else 1 end;

  if v_requested = 'waitlist' then
    if not v_allow_wl then
      return jsonb_build_object('ok', false, 'reason', 'waitlist_closed');
    end if;
    v_status := 'waitlist';
    v_bypass := true;
  elsif v_requested = 'host' then
    if not v_has_host or v_host_taken then
      return jsonb_build_object('ok', false, 'reason', 'host_unavailable');
    end if;
    v_status := 'host';
    v_bypass := true;
  elsif v_requested = 'in_kind' and (
    v_token = 'AUCTION-2026'
    or coalesce(p_row->>'notes', '') like '%[AUCTION — IN-KIND DONATION:%'
  ) then
    v_status := 'in_kind';
    v_bypass := true;
  elsif v_requested = 'paid' and (
    v_token = 'REREG-2026'
    or coalesce(p_row->>'notes', '') like '%[Re-registration — already paid via PayPal]%'
  ) then
    v_status := 'paid';
    v_bypass := true;
  elsif v_requested = 'paid' and v_price = 0 then
    v_status := 'paid';
  else
    v_status := 'pending';
  end if;

  if not v_bypass then
    select count(*)::int
      into v_rows
    from public.registrations r
    where r.session_id = v_session_id
      and lower(coalesce(r.pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded');

    v_committed := public.org_committed_participants(v_session_id);
    v_occupied := greatest(v_rows * v_per, coalesce(v_committed, 0));
    if (v_people_cap - v_occupied) < v_per then
      return jsonb_build_object('ok', false, 'reason', 'full', 'count', v_rows, 'max', v_people_cap);
    end if;
  end if;

  v_clean := p_row - 'pay_status' - 'paypal_tx_id' - 'price_paid' - 'registration_token';
  v_clean := jsonb_set(v_clean, '{pay_status}', to_jsonb(v_status), true);
  if coalesce(v_clean->>'created_at', '') = '' then
    v_clean := jsonb_set(
      v_clean,
      '{created_at}',
      to_jsonb(((extract(epoch from now()) * 1000)::numeric)::bigint),
      true
    );
  end if;

  begin
    insert into public.registrations
    select * from jsonb_populate_record(null::public.registrations, v_clean);
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'reason', 'exists');
  end;

  if v_status = 'host' then
    update public.sessions
       set host_taken = true
     where id = v_session_id;
  end if;

  return jsonb_build_object('ok', true, 'status', v_status, 'max', v_people_cap);
end;
$$;

grant execute on function public.list_public_sessions() to anon, authenticated, service_role;
grant execute on function public.get_session_by_code(text) to anon, authenticated, service_role;
grant execute on function public.register_student(jsonb, integer) to anon, authenticated;

notify pgrst, 'reload schema';
