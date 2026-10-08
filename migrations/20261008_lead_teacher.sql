-- ============================================================================
--  Mindful Beginnings — Lead Teacher (American Red Cross instructor)
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES
--    1. Adds three columns on instructors. Existing rows stay as they are:
--         is_lead_teacher          false
--         red_cross_instructor_id  blank
--         red_cross_cert_expires   blank
--       Lead Teacher is a credential, like RN or Safe Sitter®. It is not
--       the instructor level (Started / Established / Senior / Lead).
--    2. Only an admin can change those three columns.
--    3. Only a Lead Teacher can claim, be assigned to, or join the waitlist
--       for a Red Cross course. This is enforced in the database, not only
--       in the admin page.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

alter table public.instructors
  add column if not exists is_lead_teacher boolean not null default false;

alter table public.instructors
  add column if not exists red_cross_instructor_id text;

alter table public.instructors
  add column if not exists red_cross_cert_expires date;

comment on column public.instructors.is_lead_teacher is
  'American Red Cross instructor (Lead Teacher). Paid $75/hour in the app. Only an admin may change this.';

comment on column public.instructors.red_cross_instructor_id is
  'American Red Cross instructor certificate ID. Only an admin may change this.';

comment on column public.instructors.red_cross_cert_expires is
  'American Red Cross instructor certificate expiration date. Only an admin may change this.';

-- New columns are not in the column-level grant anon already has. Revoke
-- them anyway so a later table-level grant cannot leave them writable.
revoke insert, update (
  is_lead_teacher,
  red_cross_instructor_id,
  red_cross_cert_expires
) on table public.instructors from anon;

-- ----------------------------------------------------------------------------
--  Who may change the Lead Teacher columns. Same rule as instructor_level:
--  the admin portal (authenticated), the service role, or the SQL editor.
--  The instructor portal uses the anon key and cannot set these.
-- ----------------------------------------------------------------------------
create or replace function public.guard_lead_teacher_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text;
  v_changed boolean;
begin
  if tg_op = 'UPDATE' then
    v_changed := new.is_lead_teacher is distinct from old.is_lead_teacher
      or new.red_cross_instructor_id is distinct from old.red_cross_instructor_id
      or new.red_cross_cert_expires is distinct from old.red_cross_cert_expires;
    if not v_changed then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    if coalesce(new.is_lead_teacher, false) = false
       and new.red_cross_instructor_id is null
       and new.red_cross_cert_expires is null then
      return new;
    end if;
  end if;

  v_role := auth.role();
  if v_role in ('authenticated', 'service_role') then
    return new;
  end if;
  if v_role is null and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  raise exception 'Lead Teacher status can only be changed by an admin'
    using errcode = '42501';
end;
$$;

drop trigger if exists instructors_guard_lead_teacher on public.instructors;

create trigger instructors_guard_lead_teacher
  before insert or update of is_lead_teacher, red_cross_instructor_id, red_cross_cert_expires
  on public.instructors
  for each row
  execute function public.guard_lead_teacher_columns();

-- Profile updates from the instructor portal already ignore unknown keys.
-- Reject these keys up front so a future allow-list change cannot write them.
create or replace function public.instructor_update_self(p_pin text, p_changes jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id instructors.id%type;
begin
  if p_changes ? 'instructor_level' then
    raise exception 'instructor_level can only be changed by an admin'
      using errcode = '42501';
  end if;
  if p_changes ? 'is_lead_teacher'
     or p_changes ? 'red_cross_instructor_id'
     or p_changes ? 'red_cross_cert_expires' then
    raise exception 'Lead Teacher status can only be changed by an admin'
      using errcode = '42501';
  end if;

  select id into v_id from instructors where pin::text = p_pin;
  if v_id is null then
    return false;
  end if;

  update instructors set
    resume_path          = coalesce(p_changes->>'resume_path',          resume_path),
    cpr_cert_path        = coalesce(p_changes->>'cpr_cert_path',        cpr_cert_path),
    license_path         = coalesce(p_changes->>'license_path',         license_path),
    contract_signed      = coalesce((p_changes->>'contract_signed')::boolean,    contract_signed),
    contract_signed_date = coalesce(p_changes->>'contract_signed_date', contract_signed_date),
    contract_signature   = coalesce(p_changes->>'contract_signature',   contract_signature),
    w9_submitted         = coalesce((p_changes->>'w9_submitted')::boolean,       w9_submitted),
    headshot_completed   = coalesce((p_changes->>'headshot_completed')::boolean, headshot_completed),
    sweatshirt_size      = coalesce(p_changes->>'sweatshirt_size',      sweatshirt_size)
  where id = v_id;

  return true;
end;
$$;

grant execute on function public.instructor_update_self(text, jsonb) to anon;

-- The portal reads this when instructor_login does not return the new columns.
create or replace function public.instructor_lead_teacher(p_pin text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'is_lead_teacher', coalesce(is_lead_teacher, false),
    'red_cross_instructor_id', red_cross_instructor_id,
    'red_cross_cert_expires', red_cross_cert_expires
  )
  from public.instructors
  where pin::text = p_pin
  limit 1;
$$;

grant execute on function public.instructor_lead_teacher(text) to anon, authenticated;

-- Course names must match config.js / admin.html. Keep this list in both places.
create or replace function public.course_requires_lead_teacher(p_course text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_course, '') in (
    'Red Cross Babysitter''s Training + Pediatric First Aid/CPR/AED',
    'Adult & Pediatric First Aid/CPR/AED Certification'
  );
$$;

create or replace function public.instructor_row_is_lead_teacher(p_id text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select i.is_lead_teacher
    from public.instructors i
    where i.id::text = p_id
    limit 1
  ), false);
$$;

-- Sessions: primary and second instructor.
create or replace function public.guard_red_cross_session_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.course_requires_lead_teacher(new.course) then
    return new;
  end if;
  if new.instructor_id is not null and btrim(new.instructor_id::text) <> '' then
    if not public.instructor_row_is_lead_teacher(new.instructor_id::text) then
      raise exception 'Only a Lead Teacher can be assigned to a Red Cross course'
        using errcode = '42501';
    end if;
  end if;
  if new.second_instructor_id is not null and btrim(new.second_instructor_id::text) <> '' then
    if not public.instructor_row_is_lead_teacher(new.second_instructor_id::text) then
      raise exception 'Only a Lead Teacher can be assigned to a Red Cross course'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_guard_red_cross_assignment on public.sessions;

create trigger sessions_guard_red_cross_assignment
  before insert or update of course, instructor_id, second_instructor_id
  on public.sessions
  for each row
  execute function public.guard_red_cross_session_assignment();

-- Job claims and waitlist joins write job_data, including from the admin.
create or replace function public.guard_red_cross_job_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_course text;
  v_elem text;
begin
  select s.course into v_course
  from public.sessions s
  where s.id::text = new.session_id::text;

  if not public.course_requires_lead_teacher(v_course) then
    return new;
  end if;

  if new.instructor_id is not null and btrim(new.instructor_id::text) <> '' then
    if not public.instructor_row_is_lead_teacher(new.instructor_id::text) then
      raise exception 'Only a Lead Teacher can claim or be assigned to a Red Cross course'
        using errcode = '42501';
    end if;
  end if;

  if new.waitlist is not null and jsonb_typeof(new.waitlist) = 'array' then
    for v_elem in
      select jsonb_array_elements_text(new.waitlist)
    loop
      if not public.instructor_row_is_lead_teacher(v_elem) then
        raise exception 'Only a Lead Teacher can join the waitlist for a Red Cross course'
          using errcode = '42501';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists job_data_guard_red_cross_assignment on public.job_data;

create trigger job_data_guard_red_cross_assignment
  before insert or update of instructor_id, waitlist
  on public.job_data
  for each row
  execute function public.guard_red_cross_job_assignment();

-- Claiming a job. Same rules as migrations/20261008_girl_scout_badge_rn_optional.sql,
-- plus Lead Teacher for Red Cross courses. Returns false instead of raising so
-- the instructor portal can show its usual "could not accept" message. The
-- triggers above still block any other write path.
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
