-- ============================================================================
--  Instructor privacy boundary. One transaction. Not applied by this repo.
--
--  Until this commits in production, the live functions still return
--  session notes, registration notes, and every session's pay fields.
--  Deploying the pages first hides those fields in the portal. A direct
--  call to the old functions still returns them. Run this in the same
--  window as the page deploy. Do not treat this file as live protection.
--
--  Own pay is still waiting on Lindsay. This script does not delete pay
--  columns or change amounts. It returns instr_pay_override, teaching_hours,
--  and paid_travel_hours only when the active caller is that session's
--  instructor_id or second_instructor_id. Everyone else gets null.
--
--  instructor_directions can hold door codes and Zoom host keys. The text
--  is returned only to the assigned instructor and the second instructor.
--  The open board keeps city, state, zip, and the venue name. It does not
--  get the street address or the directions text. instructor_info is not
--  selected. This script does not copy notes or instructor_info into
--  instructor_directions.
--
--  Parent carryover, when reviewed, writes public.sessions.instructor_directions
--  only. Null stays null. Flagged rows stay null until a person accepts them.
--  Compare a fingerprint of the current notes and instructor_info before
--  writing, and skip the row if the source changed. Do not grant anon.
--
--  Admin gate: auth user 402193d8-a9b7-4a7b-bdbb-b939c08dbd6d, confirmed as
--  the owner. Also accepts app_metadata.role = admin. Does not read
--  user_metadata and does not treat the authenticated role as admin.
--  service_role bypasses row level security and keeps server routes working.
--
--  job_data still has anon_read_job_board USING (true). anon has no table
--  privilege. This script does not GRANT anon anything on job_data.
--
--  Rollback: migrations/20261106_instructor_directions_rollback.sql
--  It refuses to run unless the session guard is set.
-- ============================================================================

begin;

create schema if not exists private;

alter table public.sessions
  add column if not exists instructor_directions text;

comment on column public.sessions.instructor_directions is
  'Reviewed logistics for the assigned instructor only. May contain door or Zoom host credentials. Not copied from notes or instructor_info. Not granted to anon. Not returned on the open board.';

revoke select (instructor_directions), insert (instructor_directions), update (instructor_directions), references (instructor_directions)
  on table public.sessions from anon, public;

grant select (instructor_directions), insert (instructor_directions), update (instructor_directions)
  on table public.sessions to authenticated;

grant select (instructor_directions), insert (instructor_directions), update (instructor_directions)
  on table public.sessions to service_role;

revoke select (notes), insert (notes), update (notes), references (notes)
  on table public.sessions from anon, public;

create table if not exists private.portal_admins (
  user_id uuid primary key,
  recorded_at timestamptz not null default now()
);

comment on table private.portal_admins is
  'Auth users allowed through the admin Data API. Membership is not implied by the authenticated role.';

revoke all on table private.portal_admins from public, anon, authenticated;

insert into private.portal_admins (user_id)
values ('402193d8-a9b7-4a7b-bdbb-b939c08dbd6d')
on conflict (user_id) do nothing;

create or replace function private.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or exists (
      select 1
      from private.portal_admins a
      where a.user_id = auth.uid()
    );
$$;

revoke all on function private.is_portal_admin() from public, anon;
grant execute on function private.is_portal_admin() to authenticated, service_role;
grant usage on schema private to authenticated, service_role;

create or replace function private.partner_display_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when candidate is null or candidate = '' then null
    when candidate ~ E'[\n\r$0-9]' then null
    when candidate ~* '\y(invoice|payment|paid|rate|billing|bill|discount|venmo|zelle|paypal|balance|receipt|subsidy|agreement)\y' then null
    when candidate ~ '^[A-Za-z]{2,40}$' then candidate
    when candidate ~ '^([A-Za-z][A-Za-z .''’-]{0,78}[A-Za-z])$' then candidate
    else null
  end
  from (
    select btrim((regexp_match(raw, '\[Partner:[[:space:]]*([^]]{1,80})\]', 'i'))[1]) as candidate
  ) parsed;
$$;

revoke all on function private.partner_display_name(text) from public, anon, authenticated;

-- Authenticated policies below are allow-all today. Replace the ones that
-- hold session notes, registration records, job records, or client money.
-- Other allow-all policies (equipment, inventory, the instructors table)
-- are unchanged and called out in the pull request.

drop policy if exists "admin full access to sessions" on public.sessions;
create policy "admin full access to sessions"
  on public.sessions
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to registrations" on public.registrations;
create policy "admin full access to registrations"
  on public.registrations
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to job_data" on public.job_data;
create policy "admin full access to job_data"
  on public.job_data
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "invoices_admin_all" on public.invoices;
create policy "invoices_admin_all"
  on public.invoices
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to discount_codes" on public.discount_codes;
create policy "admin full access to discount_codes"
  on public.discount_codes
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to expenses" on public.expenses;
create policy "admin full access to expenses"
  on public.expenses
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to class_requests" on public.class_requests;
create policy "admin full access to class_requests"
  on public.class_requests
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to referral_commission_payouts" on public.referral_commission_payouts;
create policy "admin full access to referral_commission_payouts"
  on public.referral_commission_payouts
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to referral_commission_snapshots" on public.referral_commission_snapshots;
create policy "admin full access to referral_commission_snapshots"
  on public.referral_commission_snapshots
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin full access to referral_overhead_rules" on public.referral_overhead_rules;
create policy "admin full access to referral_overhead_rules"
  on public.referral_overhead_rules
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "admin manages partner payouts" on public.partner_payouts;
create policy "admin manages partner payouts"
  on public.partner_payouts
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

drop policy if exists "auth all" on public.community_partner_payouts;
create policy "auth all"
  on public.community_partner_payouts
  for all
  to authenticated
  using (private.is_portal_admin())
  with check (private.is_portal_admin());

create or replace function public.instructor_list_sessions(p_pin text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
begin
  select i.id::text, coalesce(i.is_active, true)
    into v_id, v_active
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_id is null or v_active is distinct from true then
    raise exception 'invalid pin';
  end if;

  return query
  select to_jsonb(x) from (
    select s.id, s.code, s.course, s.date, s."time", s.location, s.city, s.state, s.zip,
           s.owner_taught, s.host_taken, s.has_host, s.instructor_id,
           s.second_instructor_id,
           case
             when s.instructor_id::text = v_id or s.second_instructor_id::text = v_id
               then s.instr_pay_override
           end as instr_pay_override,
           case
             when s.instructor_id::text = v_id or s.second_instructor_id::text = v_id
               then s.teaching_hours
           end as teaching_hours,
           case
             when s.instructor_id::text = v_id or s.second_instructor_id::text = v_id
               then s.paid_travel_hours
           end as paid_travel_hours,
           s.max_students_override, s.participants_expected,
           s.is_custom_job, s.is_virtual, s.is_hold, s.is_cancelled, s.cancel_reason,
           s.allow_waitlist, s.extra_dates, s.is_recurring, s.recur_pattern, s.recur_end_date,
           s.extra_days, s.closures,
           case
             when s.instructor_id::text = v_id or s.second_instructor_id::text = v_id
               then s.instructor_directions
           end as instructor_directions,
           s.requires_rn, s.requires_safe_sitter, s.requires_spanish,
           case
             when s.instructor_id::text = v_id or s.second_instructor_id::text = v_id
               then s.host_address
           end as host_address
    from public.sessions s
  ) x;
end;
$$;

revoke all on function public.instructor_list_sessions(text) from public;
grant execute on function public.instructor_list_sessions(text) to anon, authenticated, service_role;

drop function if exists public.instructor_session_notes(text);

create function public.instructor_session_notes(p_pin text)
returns table (
  session_id text,
  instructor_directions text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
begin
  select i.id::text, coalesce(i.is_active, true)
    into v_id, v_active
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_id is null or v_active is distinct from true then
    return;
  end if;

  return query
  select s.id, s.instructor_directions
  from public.sessions s
  where s.instructor_id::text = v_id
     or s.second_instructor_id::text = v_id;
end;
$$;

revoke all on function public.instructor_session_notes(text) from public;
grant execute on function public.instructor_session_notes(text) to anon, authenticated;

drop function if exists public.instructor_job_details(text);

create function public.instructor_job_details(p_pin text)
returns table (
  session_id text,
  materials_method text,
  materials_sent boolean,
  eval_received boolean,
  pay_status text,
  pay_date text,
  referral_bonus numeric,
  paid_fee numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
begin
  select i.id::text, coalesce(i.is_active, true)
    into v_id, v_active
  from public.instructors i
  where i.pin = p_pin
  limit 1;
  if v_id is null or v_active is distinct from true then
    return;
  end if;

  return query
  select j.session_id,
         j.materials_method,
         coalesce(j.materials_sent, false),
         coalesce(j.eval_received, false),
         j.pay_status,
         j.pay_date,
         j.referral_bonus,
         j.paid_fee
  from public.job_data j
  where j.instructor_id::text = v_id;
end;
$$;

revoke all on function public.instructor_job_details(text) from public;
grant execute on function public.instructor_job_details(text) to anon, authenticated;

create or replace function public.instructor_session_private(p_pin text, p_session_id text)
returns table (
  host_address text,
  host_phone text,
  wifi_info text,
  contact_day text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instr text;
  v_active boolean;
begin
  select i.id::text, coalesce(i.is_active, true)
    into v_instr, v_active
  from public.instructors i
  where i.pin = p_pin
  limit 1;
  if v_instr is null or v_active is distinct from true then
    return;
  end if;

  return query
  select s.host_address, s.host_phone, s.wifi_info, s.contact_day
  from public.sessions s
  where s.id::text = p_session_id
    and (
      s.instructor_id::text = v_instr
      or s.second_instructor_id::text = v_instr
      or exists (
        select 1 from public.job_data j
        where j.session_id = s.id
          and j.instructor_id::text = v_instr
      )
    );
end;
$$;

revoke all on function public.instructor_session_private(text, text) from public;
grant execute on function public.instructor_session_private(text, text) to anon, authenticated;

drop function if exists public.instructor_get_roster(text, text);

create function public.instructor_get_roster(p_pin text, p_session_id text)
returns table (
  student_name text,
  grade text,
  parent_name text,
  contact text,
  cpr_permission text,
  emergency_auth text,
  waiver_signed boolean,
  partner_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
begin
  select i.id::text, coalesce(i.is_active, true)
    into v_id, v_active
  from public.instructors i
  where i.pin = p_pin
  limit 1;
  if v_id is null or v_active is distinct from true then
    return;
  end if;
  if not exists (
    select 1
    from public.sessions s
    where s.id::text = p_session_id
      and (
        s.instructor_id::text = v_id
        or s.second_instructor_id::text = v_id
      )
  ) and not exists (
    select 1
    from public.job_data j
    where j.session_id::text = p_session_id
      and j.instructor_id::text = v_id
  ) then
    return;
  end if;

  return query
  select r.student_name,
         r.grade,
         r.parent_name,
         r.contact,
         r.cpr_permission,
         r.emergency_auth,
         r.waiver_signed,
         private.partner_display_name(r.notes)
  from public.registrations r
  where r.session_id::text = p_session_id;
end;
$$;

revoke all on function public.instructor_get_roster(text, text) from public;
grant execute on function public.instructor_get_roster(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
