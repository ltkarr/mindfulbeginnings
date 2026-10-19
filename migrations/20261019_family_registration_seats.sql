-- Seat rule. Occupied seats are the larger of these, never the sum:
--
--   1. Real participant registrations. Waitlist, cancelled, and refunded
--      rows do not take a seat.
--   2. billed_headcount, only when the organization handles registration
--      itself (org_handles_registration). That roster is already claimed,
--      and registering those people does not take a second set of seats.
--   3. reserved_seats, an explicit hold. A hold with no reserved number
--      does not invent a headcount.
--
-- A billed headcount on a session where families still register
-- (org_handles_registration false) is the invoice roster. It does not take
-- a seat. GS-H4782 bills Troop 34182 $30 x 15 and stays open until 15
-- families have registered. The invoice columns are not changed here.
--
-- Supersedes the seat-hold half of migrations/20261013_org_committed_seats.sql
-- for family-registration sessions. Safe to run more than once.
-- Functions only. No session or registration rows are updated.

create or replace function public.org_committed_participants(p_session_id text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select case
      when coalesce(s.org_handles_registration, false) = false then 0
      when coalesce(btrim(s.bill_to_org), '') = '' then 0
      when s.billed_headcount is null or s.billed_headcount <= 0 then 0
      else floor(s.billed_headcount)::int
    end
    from public.sessions s
    where s.id = p_session_id
  ), 0);
$$;

revoke all on function public.org_committed_participants(text) from public, anon, authenticated;

-- People held before a family registration: the org roster when the
-- organization registers them, and any explicit reserved-seat hold.
create or replace function public.held_participants(p_session_id text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select greatest(
      public.org_committed_participants(s.id),
      case
        when s.reserved_seats is null or s.reserved_seats <= 0 then 0
        else floor(s.reserved_seats)::int
      end
    )
    from public.sessions s
    where s.id = p_session_id
  ), 0);
$$;

revoke all on function public.held_participants(text) from public, anon, authenticated;

-- Row count the public page and instructor portal already multiply by seats
-- per registration. A couple course turns a people hold into rows.
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
        when public.held_participants(s.id) <= 0 then 0
        when s.course in ('Baby Ready', 'Baby Ready + CPR Certification')
          then ceil(public.held_participants(s.id)::numeric / 2)::int
        else public.held_participants(s.id)
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
             when public.held_participants(s.id) <= 0 then 0
             when s.course in ('Baby Ready', 'Baby Ready + CPR Certification')
               then ceil(public.held_participants(s.id)::numeric / 2)::int
             else public.held_participants(s.id)
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
     or public.held_participants(s.id) > 0;
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
  v_held       integer;
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

    v_held := public.held_participants(v_session_id);
    v_occupied := greatest(v_rows * v_per, coalesce(v_held, 0));
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
