-- Undo migrations/20261106_instructor_directions.sql after it has committed.
-- This restores the previous allow-all authenticated policies and the
-- previous instructor functions, which again return session notes and
-- every session's pay fields. Do not run it as part of a deploy.
--
-- The instructor_directions column is left in place so a reviewed
-- carryover is not destroyed. Drop it by hand only if it is still empty.
--
-- The script stops unless this session has set the guard:
--   set mb.rollback_instructor_privacy = 'yes';

begin;

do $$
begin
  if current_setting('mb.rollback_instructor_privacy', true) is distinct from 'yes' then
    raise exception 'Refusing rollback. set mb.rollback_instructor_privacy = ''yes'' for this session, then run the script again.';
  end if;
end $$;

drop policy if exists "admin full access to sessions" on public.sessions;
create policy "admin full access to sessions" on public.sessions for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to registrations" on public.registrations;
create policy "admin full access to registrations" on public.registrations for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to job_data" on public.job_data;
create policy "admin full access to job_data" on public.job_data for all to authenticated using (true) with check (true);

drop policy if exists "invoices_admin_all" on public.invoices;
create policy "invoices_admin_all" on public.invoices for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to discount_codes" on public.discount_codes;
create policy "admin full access to discount_codes" on public.discount_codes for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to expenses" on public.expenses;
create policy "admin full access to expenses" on public.expenses for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to class_requests" on public.class_requests;
create policy "admin full access to class_requests" on public.class_requests for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to referral_commission_payouts" on public.referral_commission_payouts;
create policy "admin full access to referral_commission_payouts" on public.referral_commission_payouts for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to referral_commission_snapshots" on public.referral_commission_snapshots;
create policy "admin full access to referral_commission_snapshots" on public.referral_commission_snapshots for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to referral_overhead_rules" on public.referral_overhead_rules;
create policy "admin full access to referral_overhead_rules" on public.referral_overhead_rules for all to authenticated using (true) with check (true);

drop policy if exists "admin manages partner payouts" on public.partner_payouts;
create policy "admin manages partner payouts" on public.partner_payouts for all to authenticated using (true) with check (true);

drop policy if exists "auth all" on public.community_partner_payouts;
create policy "auth all" on public.community_partner_payouts for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to instructors" on public.instructors;
create policy "admin full access to instructors" on public.instructors for all to authenticated using (true) with check (true);

drop policy if exists "admin manages partners" on public.partners;
create policy "admin manages partners" on public.partners for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to referral_partners" on public.referral_partners;
create policy "admin full access to referral_partners" on public.referral_partners for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to partner_portal" on public.partner_portal;
create policy "admin full access to partner_portal" on public.partner_portal for all to authenticated using (true) with check (true);

drop policy if exists "auth all" on public.community_partners;
create policy "auth all" on public.community_partners for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to admin_settings" on public.admin_settings;
create policy "admin full access to admin_settings" on public.admin_settings for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to inventory_items" on public.inventory_items;
create policy "admin full access to inventory_items" on public.inventory_items for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to inventory_purchases" on public.inventory_purchases;
create policy "admin full access to inventory_purchases" on public.inventory_purchases for all to authenticated using (true) with check (true);

drop policy if exists "admin full access to course_inventory_use" on public.course_inventory_use;
create policy "admin full access to course_inventory_use" on public.course_inventory_use for all to authenticated using (true) with check (true);

drop policy if exists "admin read course_evaluations" on public.course_evaluations;
create policy "admin read course_evaluations" on public.course_evaluations for select to authenticated using (true);

drop policy if exists "admin delete course_evaluations" on public.course_evaluations;
create policy "admin delete course_evaluations" on public.course_evaluations for delete to authenticated using (true);

drop policy if exists "admin read onboarding_results" on public.onboarding_results;
create policy "admin read onboarding_results" on public.onboarding_results for select to authenticated using (true);

drop policy if exists "admin delete onboarding_results" on public.onboarding_results;
create policy "admin delete onboarding_results" on public.onboarding_results for delete to authenticated using (true);

drop policy if exists "admin read srf_grant_responses" on public.srf_grant_responses;
create policy "admin read srf_grant_responses" on public.srf_grant_responses for select to authenticated using (true);

drop policy if exists "Admin full access" on public.equipment;
create policy "Admin full access" on public.equipment for all to authenticated using (true) with check (true);

drop policy if exists "Admin full access" on public.equipment_checkouts;
create policy "Admin full access" on public.equipment_checkouts for all to authenticated using (true) with check (true);

-- Previous instructor_list_sessions body from migrations/20261103_instructor_grant_tag.sql.
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
           second_instructor_id, instr_pay_override, teaching_hours, paid_travel_hours,
           max_students_override, participants_expected,
           is_custom_job, is_virtual, is_hold, is_cancelled, cancel_reason,
           allow_waitlist, extra_dates, is_recurring, recur_pattern, recur_end_date,
           extra_days, closures, instructor_info, requires_rn, requires_safe_sitter,
           requires_spanish, host_address, grant_tag
    from public.sessions
  ) x;
end;
$$;

drop function if exists public.instructor_session_notes(text);
create function public.instructor_session_notes(p_pin text)
returns table (session_id text, notes text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.instructors i
    where i.pin = p_pin and coalesce(i.is_active, true)
  ) then
    return;
  end if;
  return query select s.id, s.notes from public.sessions s;
end;
$$;

drop function if exists public.instructor_job_details(text);
create function public.instructor_job_details(p_pin text)
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
  where i.pin = p_pin and coalesce(i.is_active, true)
  limit 1;
  if v_id is null then
    return;
  end if;
  return query
  select j.session_id, j.materials_method, coalesce(j.materials_sent, false),
         coalesce(j.eval_received, false), j.pay_status, j.pay_date, j.notes,
         j.referral_bonus, j.paid_fee
  from public.job_data j
  where j.instructor_id = v_id;
end;
$$;

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
  pay_status text,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_id text;
begin
  select id into v_instructor_id from public.instructors where pin = p_pin limit 1;
  if v_instructor_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.job_data
    where session_id = p_session_id and instructor_id = v_instructor_id
  ) then
    return;
  end if;
  return query
  select r.student_name, r.grade, r.parent_name, r.contact,
         r.cpr_permission, r.emergency_auth, r.waiver_signed,
         r.pay_status, r.notes
  from public.registrations r
  where r.session_id = p_session_id;
end;
$$;

create or replace function public.instructor_cancel_job(p_pin text, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instructor_id text;
begin
  select id into v_instructor_id from public.instructors where pin = p_pin limit 1;
  if v_instructor_id is null then
    return false;
  end if;
  update public.job_data
     set instructor_id = null
   where session_id = p_session_id
     and instructor_id = v_instructor_id;
  if not found then
    return false;
  end if;
  update public.sessions
     set instructor_id = null
   where id = p_session_id;
  return true;
end;
$$;

commit;
