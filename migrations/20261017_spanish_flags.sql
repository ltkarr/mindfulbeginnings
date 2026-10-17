-- ============================================================================
--  Mindful Beginnings — Spanish-language job flag
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.requires_spanish (boolean, default false). A job ticked
--       "Requires Spanish-speaking instructor" in admin — or requested in
--       Spanish on the home-host / organization form — is only visible to
--       (and assignable to, without a warning) instructors flagged as
--       Spanish speakers. Same pattern as requires_rn / requires_safe_sitter.
--    2. Adds instructors.speaks_spanish (boolean, default false). Lindsay
--       ticks it on the instructor's card in admin.
--    3. Adds the instructor_speaks_spanish(p_pin) helper RPC so the
--       instructor portal can read the flag even if the deployed
--       instructor_login predates the column (same shape as
--       instructor_is_rn / instructor_lead_teacher).
--    4. Adds sessions.host_address to instructor_list_sessions so the Open
--       Jobs board can show the full street address before acceptance.
--       (Lindsay 2026-10-17: instructors will not accept a job without
--       knowing exactly where it is. Host cell, day-of contact, and WiFi
--       stay behind the post-acceptance private RPC.)
--
--  SAFE TO RE-RUN: yes. Columns, function, and grants are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists requires_spanish boolean default false;

comment on column public.sessions.requires_spanish is
  'Job must be taught in Spanish. Only instructors flagged speaks_spanish see it on Open Jobs.';

-- The portal and register page read sessions through the anon key; the new
-- column needs the same per-column grant the other requirement flags have.
grant select (requires_spanish) on public.sessions to anon;

alter table public.instructors
  add column if not exists speaks_spanish boolean default false;

comment on column public.instructors.speaks_spanish is
  'Instructor can teach in Spanish. Set by the admin on the Instructors tab.';

-- Helper RPC for the instructor portal (PIN-authenticated, anon key).
-- Same shape as instructor_is_rn / instructor_lead_teacher.
create or replace function public.instructor_speaks_spanish(p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(speaks_spanish, false)
  from public.instructors
  where pin::text = p_pin
  limit 1;
$$;

grant execute on function public.instructor_speaks_spanish(text) to anon, authenticated;

-- The instructor portal reads its job board through instructor_list_sessions,
-- which selects an explicit column list. Add requires_spanish so Spanish-only
-- jobs carry the flag to the portal (same as requires_rn / requires_safe_sitter).
create or replace function public.instructor_list_sessions(p_pin text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile json;
begin
  select (to_jsonb(i) - 'pin')::json
    into v_profile
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_profile is null then
    raise exception 'invalid pin';
  end if;

  return query
  select to_jsonb(x) from (
    select id, code, course, date, "time", location, city, state, zip,
           owner_taught, host_taken, has_host, instructor_id,
           second_instructor_id, instr_pay_override, max_students_override,
           is_custom_job, is_virtual, is_hold, is_cancelled, cancel_reason,
           allow_waitlist, extra_dates, is_recurring, recur_pattern, recur_end_date,
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter,
           requires_spanish, host_address
    from public.sessions
  ) x;
end;
$$;

grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
--  Fix: instructor_update_self was missing headshot_path, so headshot uploads
--  saved the file to storage but silently dropped the path (only
--  headshot_completed was set). This version adds it. Same allow-list as the
--  live function — instructor_level / Lead Teacher stay admin-only.
-- ----------------------------------------------------------------------------
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
    headshot_path        = coalesce(p_changes->>'headshot_path',        headshot_path),
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

-- ----------------------------------------------------------------------------
--  Storage policies for the instructor-docs bucket (created manually in the
--  dashboard). The portal uses the anon key + PIN, so both upload and
--  signed-URL reads need anon policies. Files stay private: reads go through
--  createSignedUrl (5-minute links), never public URLs.
-- ----------------------------------------------------------------------------
drop policy if exists "Instructors can upload docs" on storage.objects;
create policy "Instructors can upload docs"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'instructor-docs');

drop policy if exists "Instructors can read docs" on storage.objects;
create policy "Instructors can read docs"
  on storage.objects for select
  to anon
  using (bucket_id = 'instructor-docs');

drop policy if exists "Instructors can replace docs" on storage.objects;
create policy "Instructors can replace docs"
  on storage.objects for update
  to anon
  using (bucket_id = 'instructor-docs')
  with check (bucket_id = 'instructor-docs');
