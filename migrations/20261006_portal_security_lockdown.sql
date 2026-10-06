-- ============================================================================
--  Mindful Beginnings — portal security, part B (lockdown)
--
--  DO NOT RUN until migrations/20261006_portal_security_additive.sql has been
--  applied AND the site that calls the new functions is deployed:
--    register.html            register_student, mark_payment_sent,
--                             get_session_instructor_phone
--    instructor.html          instructor_job_details, instructor_session_notes
--                             (and it no longer selects sessions.notes or
--                             job_data *)
--    api/remind-instructors.js  service role for the reminder RPCs
--
--  Admin sign-in is Supabase Auth. The authenticated policies
--  ("admin full access ...") are left in place, so a signed-in admin can
--  still read and write these tables. This file only removes the public
--  anon path.
-- ============================================================================

-- Column-level grants are separate from table grants. Clear both.
do $$
declare
  r record;
begin
  for r in
    select grantee, table_name, column_name, privilege_type
    from information_schema.column_privileges
    where table_schema = 'public'
      and grantee in ('anon', 'public')
      and table_name in ('instructors', 'registrations', 'expenses', 'job_data')
  loop
    execute format(
      'revoke %s (%I) on public.%I from %I',
      r.privilege_type, r.column_name, r.table_name, r.grantee
    );
  end loop;
end $$;

revoke all on table public.registrations from anon, public;
revoke all on table public.instructors from anon, public;
revoke all on table public.expenses from anon, public;
revoke all on table public.job_data from anon, public;

-- The open policies. Authenticated admin policies stay.
drop policy if exists public_all on public.registrations;
drop policy if exists "anon can insert registrations" on public.registrations;
drop policy if exists public_all on public.instructors;
drop policy if exists public_all on public.expenses;
drop policy if exists public_all on public.job_data;
drop policy if exists "anon can read job_data" on public.job_data;
drop policy if exists "portal can read job_data" on public.job_data;

-- Job board columns only. Pay, materials, and job notes come from
-- instructor_job_details(pin).
grant select (session_id, instructor_id, waitlist) on public.job_data to anon;

create policy anon_read_job_board
  on public.job_data
  for select
  to anon
  using (true);

-- Session notes and host contact fields are no longer public.
-- Admin (authenticated) still has full table access. Instructors read notes
-- through instructor_session_notes and host contact through
-- instructor_session_private.
revoke select (notes) on public.sessions from anon, public;
revoke select (host_phone) on public.sessions from anon, public;
revoke select (wifi_info) on public.sessions from anon, public;
revoke select (contact_day) on public.sessions from anon, public;
revoke select (contact_name) on public.sessions from anon, public;

-- These used to be callable with the anon key and no other secret.
revoke all on function public.get_instructor_phone(text) from public, anon, authenticated;
revoke all on function public.get_tomorrow_reminders() from public, anon, authenticated;
revoke all on function public.log_reminder_sent(text) from public, anon, authenticated;
revoke all on function public.mark_host_taken(text) from public, anon, authenticated;

-- The reminder cron calls these with the service role key.
grant execute on function public.get_tomorrow_reminders() to service_role;
grant execute on function public.log_reminder_sent(text) to service_role;
