-- ============================================================================
--  Mindful Beginnings — portal security, part A (additive)
--
--  Safe to apply while the current site is still live. This file only ADDS
--  or replaces functions. It does not drop the open public_all policies and
--  does not revoke the anon key's table access.
--
--  Apply this first. Deploy the matching register.html / instructor.html /
--  api/remind-instructors.js. Only then run
--  migrations/20261006_portal_security_lockdown.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Rate-limited instructor PIN login.
--  Same call as before: instructor_login(p_pin) -> profile JSON without the PIN,
--  or null. Six wrong tries from one IP in 15 minutes lock that IP for 15 minutes.
-- ----------------------------------------------------------------------------

create table if not exists public.mb_login_attempts (
  ip            text primary key,
  fail_count    int          not null default 0,
  first_fail    timestamptz  not null default now(),
  locked_until  timestamptz
);

alter table public.mb_login_attempts enable row level security;
revoke all on table public.mb_login_attempts from public, anon, authenticated;

create or replace function public.instructor_login(p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_profile  json;
  v_row      public.mb_login_attempts%rowtype;
  v_window   interval := interval '15 minutes';
  v_max      int      := 6;
  v_lockout  interval := interval '15 minutes';
begin
  begin
    v_ip := split_part(
              coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), 'unknown'),
              ',', 1);
  exception when others then
    v_ip := 'unknown';
  end;
  v_ip := nullif(btrim(v_ip), '');
  if v_ip is null then
    v_ip := 'unknown';
  end if;

  select * into v_row from public.mb_login_attempts where ip = v_ip;
  if found and v_row.locked_until is not null and v_row.locked_until > now() then
    return null;
  end if;

  select (to_jsonb(i) - 'pin')::json
    into v_profile
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_profile is not null then
    delete from public.mb_login_attempts where ip = v_ip;
    return v_profile;
  end if;

  insert into public.mb_login_attempts (ip, fail_count, first_fail)
  values (v_ip, 1, now())
  on conflict (ip) do update set
    fail_count = case
                   when public.mb_login_attempts.first_fail < now() - v_window then 1
                   else public.mb_login_attempts.fail_count + 1
                 end,
    first_fail = case
                   when public.mb_login_attempts.first_fail < now() - v_window then now()
                   else public.mb_login_attempts.first_fail
                 end,
    locked_until = case
                     when public.mb_login_attempts.first_fail < now() - v_window then null
                     else public.mb_login_attempts.locked_until
                   end;

  update public.mb_login_attempts
     set locked_until = now() + v_lockout
   where ip = v_ip
     and fail_count >= v_max
     and first_fail >= now() - v_window;

  return null;
end;
$$;

grant execute on function public.instructor_login(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
--  register_student: the server sets pay status and the seat cap.
--  The client still calls register_student(p_row, p_max). p_max is ignored.
--  pay_status from the client is only an intent, and only these intents stick:
--    waitlist  — when the session allows a waitlist (does not take a seat)
--    host      — when the session still has an open host spot
--    in_kind   — only with the auction registration token (bypasses the cap)
--    paid      — only with the re-registration token (bypasses the cap),
--                or when the session price override is $0 (still uses the cap)
--  Everything else, including a forged "paid", is stored as pending.
--  paypal_tx_id and price_paid are never taken from the client. PayPal capture
--  (service role) is what marks a pending row paid.
--
--  SEAT_COUNT_EXCLUDES waitlist, cancelled, canceled, and refunded.
--  Host rows still count toward the student cap, matching the previous rule
--  that a host bypasses the check for themselves but occupies a person-seat
--  for everyone else. Baby Ready counts two people per row.
-- ----------------------------------------------------------------------------

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

-- Venmo / Zelle "I sent it". Does not change pay status and does not accept
-- caller-supplied notes. Pending and unpaid rows only.
create or replace function public.mark_payment_sent(
  p_registration_id text,
  p_method text,
  p_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(btrim(coalesce(p_method, '')));
  v_tag text;
  v_updated int;
begin
  if v_method not in ('venmo', 'zelle') then
    return jsonb_build_object('ok', false, 'reason', 'bad_method');
  end if;
  if coalesce(btrim(p_registration_id), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'bad_id');
  end if;

  v_tag := case v_method
    when 'venmo' then '[Family marked VENMO sent — confirm in Venmo app]'
    else '[Family marked ZELLE sent — confirm in Zelle app]'
  end;

  update public.registrations
     set payment_method = v_method,
         payment_ref = nullif(left(btrim(coalesce(p_ref, '')), 240), ''),
         notes = case
           when coalesce(notes, '') ilike '%' || v_tag || '%' then notes
           else btrim(v_tag || ' ' || coalesce(notes, ''))
         end
   where id = p_registration_id
     and lower(coalesce(pay_status, '')) in ('pending', 'unpaid');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_updated');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.mark_payment_sent(text, text, text) to anon, authenticated;

-- Instructor phone for a specific session only. Replaces the old
-- get_instructor_phone(instructor id), which returned any instructor's phone.
-- The old function stays until the lockdown migration revokes it.
create or replace function public.get_session_instructor_phone(p_session_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select i.phone
  from public.sessions s
  join public.instructors i on i.id::text = s.instructor_id::text
  where s.id::text = p_session_id
    and coalesce(s.instructor_id, '') <> ''
  limit 1;
$$;

grant execute on function public.get_session_instructor_phone(text) to anon, authenticated;

-- Pay, materials, and job notes for the signed-in instructor's own jobs.
-- The public job board only needs session_id, instructor_id, and waitlist.
create or replace function public.instructor_job_details(p_pin text)
returns table (
  session_id text,
  materials_method text,
  materials_sent boolean,
  eval_received boolean,
  pay_status text,
  pay_date text,
  notes text,
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
         j.notes,
         j.referral_bonus,
         j.paid_fee
  from public.job_data j
  where j.instructor_id = v_id;
end;
$$;

grant execute on function public.instructor_job_details(text) to anon, authenticated;

-- Instructor-facing session notes. Sensitive notes are moved off this column
-- below; what remains is what the job board is supposed to show, and only a
-- valid active PIN can read it.
create or replace function public.instructor_session_notes(p_pin text)
returns table (
  session_id text,
  notes text
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
  select s.id, s.notes
  from public.sessions s;
end;
$$;

grant execute on function public.instructor_session_notes(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
--  Accepting a job checks the PIN plus active, onboarding, Safe Sitter®,
--  and RN-required. A cancelled, on-hold, or owner-taught session cannot
--  be claimed. A job already held by someone else cannot be taken.
-- ----------------------------------------------------------------------------

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
  v_current text;
  v_course text;
  v_requires_rn boolean;
  v_requires_ss boolean;
  v_cancelled boolean;
  v_hold boolean;
  v_owner boolean;
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
         coalesce(i.is_rn, false)
    into v_id, v_active, v_onboarded, v_ss, v_rn
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

  if v_requires_ss or v_course in (
    'Safe Sitter®',
    'Grandparents: Getting Started'
  ) then
    if not v_ss then
      return false;
    end if;
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

-- ----------------------------------------------------------------------------
--  Move session notes that contain an email, a phone number, or payment /
--  invoice language into admin_private_notes, which anon cannot read.
--  Ordinary instructor-facing notes stay on sessions.notes.
-- ----------------------------------------------------------------------------

update public.sessions
   set admin_private_notes = concat_ws(
         E'\n\n',
         nullif(btrim(admin_private_notes), ''),
         '[Moved from session notes]' || E'\n' || notes
       ),
       notes = null
 where notes is not null
   and btrim(notes) <> ''
   and (
     notes ~* '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'
     or notes ~* '(paypal|venmo|zelle|invoice|payment)'
     or notes ~ '(^|[^0-9])(\+?1[-. ]?)?\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)'
   );
