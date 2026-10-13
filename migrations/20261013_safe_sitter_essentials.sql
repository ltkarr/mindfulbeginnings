-- Safe Sitter® Babysitting Essentials is its own 4-hour course, cap 16.
-- Safe Sitter® (the 5-hour course with the CPR module) is unchanged.
-- Essentials requires a Safe Sitter® certified instructor, same as Safe Sitter®.
-- This replaces register_student and instructor_accept_job only to add that course.

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
  v_per := case when v_course = 'Baby Ready' then 2 else 1 end;

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

    if (v_people_cap - (v_rows * v_per)) < v_per then
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

create or replace function public.instructor_accept_job(p_pin text, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
  v_onboarded boolean;
  v_ss boolean;
  v_rn boolean;
  v_lead boolean;
  v_current text;
  v_course text;
  v_requires_rn boolean;
  v_requires_ss boolean;
  v_cancelled boolean;
  v_hold boolean;
  v_owner boolean;
  v_girl_scout boolean;
begin
  select i.id,
         coalesce(i.is_active, true),
         (
           coalesce(i.contract_signed, false)
           and coalesce(i.w9_submitted, false)
           and coalesce(btrim(i.cpr_cert_path), '') <> ''
           and coalesce(btrim(i.license_path), '') <> ''
           and coalesce(i.headshot_completed, false)
           and (
             coalesce(btrim(i.safe_sitter_training_date), '') <> ''
             or i.safe_sitter_certified = false
           )
         ),
         coalesce(i.safe_sitter_certified, false),
         coalesce(i.is_rn, false),
         coalesce(i.is_lead_teacher, false)
    into v_id, v_active, v_onboarded, v_ss, v_rn, v_lead
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_id is null or not v_active or not v_onboarded then
    return false;
  end if;

  select s.course,
         coalesce(s.requires_rn, false),
         coalesce(s.requires_safe_sitter, false),
         coalesce(s.is_cancelled, false),
         coalesce(s.is_hold, false),
         coalesce(s.owner_taught, false)
    into v_course, v_requires_rn, v_requires_ss, v_cancelled, v_hold, v_owner
  from public.sessions s
  where s.id = p_session_id;

  if not found or v_cancelled or v_hold or v_owner then
    return false;
  end if;

  v_girl_scout := v_course ~* 'girl scouts?' and v_course ~* 'badge';

  if v_requires_rn or v_course in (
    'Stay Ready: Choking Rescue and CPR',
    'Campus Ready: Safety Skills for College Life',
    'Ready. Period.',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'
  ) then
    if not v_rn then
      return false;
    end if;
  end if;

  if not v_girl_scout and (
    v_requires_ss or v_course in (
      'Safe Sitter®',
      'Safe Sitter® Babysitting Essentials',
      'Grandparents: Getting Started'
    )
  ) then
    if not v_ss then
      return false;
    end if;
  end if;

  if public.course_requires_lead_teacher(v_course) and not v_lead then
    return false;
  end if;

  select j.instructor_id into v_current
  from public.job_data j
  where j.session_id = p_session_id;
  if v_current is not null and v_current <> v_id then
    return false;
  end if;

  insert into public.job_data (session_id, instructor_id, waitlist)
  values (p_session_id, v_id, '[]'::jsonb)
  on conflict (session_id) do update
    set instructor_id = excluded.instructor_id,
        waitlist = coalesce((
          select jsonb_agg(elem)
          from jsonb_array_elements_text(public.job_data.waitlist) elem
          where elem <> excluded.instructor_id
        ), '[]'::jsonb);

  update public.sessions
     set instructor_id = v_id
   where id = p_session_id;

  return true;
end;
$$;
grant execute on function public.instructor_accept_job(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
