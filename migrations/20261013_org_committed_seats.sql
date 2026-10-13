-- An organization commitment reserves seats before those people register.
-- Occupied seats are the larger of live registrations and that commitment,
-- so registering the committed people does not take a second set of seats.
-- Safe to run more than once.

create or replace function public.org_committed_participants(p_session_id text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select case
      when coalesce(btrim(s.bill_to_org), '') = '' then 0
      when s.billed_headcount is null or s.billed_headcount <= 0 then 0
      else floor(s.billed_headcount)::int
    end
    from public.sessions s
    where s.id = p_session_id
  ), 0);
$$;

revoke all on function public.org_committed_participants(text) from public, anon, authenticated;

-- Row count the public page and instructor portal already multiply by seats
-- per registration. A couple course turns a people commitment into rows.
create or replace function public.get_registration_count(p_session_id text)
returns integer
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(greatest(
    (
      select count(*)::int
      from public.registrations
      where session_id = p_session_id
        and lower(coalesce(pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded')
    ),
    coalesce((
      select case
        when public.org_committed_participants(s.id) <= 0 then 0
        when s.course in ('Baby Ready', 'Baby Ready + CPR Certification')
          then ceil(public.org_committed_participants(s.id)::numeric / 2)::int
        else public.org_committed_participants(s.id)
      end
      from public.sessions s
      where s.id = p_session_id
    ), 0)
  ), 0);
$$;

create or replace function public.get_all_registration_counts()
returns table(session_id text, cnt integer)
language sql
security definer
set search_path to 'public'
as $$
  select s.id,
         greatest(
           coalesce(c.cnt, 0),
           case
             when public.org_committed_participants(s.id) <= 0 then 0
             when s.course in ('Baby Ready', 'Baby Ready + CPR Certification')
               then ceil(public.org_committed_participants(s.id)::numeric / 2)::int
             else public.org_committed_participants(s.id)
           end
         )::int
  from public.sessions s
  left join (
    select r.session_id, count(*)::int as cnt
    from public.registrations r
    where lower(coalesce(r.pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded')
    group by r.session_id
  ) c on c.session_id = s.id
  where coalesce(c.cnt, 0) > 0
     or public.org_committed_participants(s.id) > 0;
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
         s.price_override
    into v_course, v_people_cap, v_has_host, v_host_taken, v_allow_wl, v_cancelled, v_price
  from public.sessions s
  where s.id = v_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_cancelled then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
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
    -- Forged paid / in_kind / host, and ordinary Venmo, Zelle, and PayPal reserves.
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

grant execute on function public.register_student(jsonb, integer) to anon, authenticated;

notify pgrst, 'reload schema';
