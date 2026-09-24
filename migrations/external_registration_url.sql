-- ============================================================================
--  Mindful Beginnings — partner-hosted public registration
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.external_registration_url (nullable text).
--       When a session has an https link here, the public register page
--       opens that link and does not start Mindful Beginnings payment.
--    2. Grants anon SELECT on the new column. Sessions uses column-level
--       SELECT for anon. A missing grant makes the public sessions query
--       fail entirely, not just omit this field.
--    3. Points the existing Ready. Period. session RP-261023 at District
--       DabbleLab and uses the parent-facing course name. Does not insert
--       a second session.
--
--  SAFE TO RE-RUN: yes. The column add and grant are idempotent, and the
--  session update sets the same values again.
-- ============================================================================

alter table public.sessions
  add column if not exists external_registration_url text;

comment on column public.sessions.external_registration_url is
  'Optional https URL. Public registration opens this partner page instead of Mindful Beginnings checkout.';

grant select (external_registration_url) on public.sessions to anon;

-- Ready. Period. at District Dabble Lab, Oct 23 2026.
-- Parent-facing name matches config.js COURSES. The RN-only note stays in
-- notes (job board), not in the course title. is_custom_job is left as-is:
-- the public list shows a custom job only when this URL is set, so the
-- current register page keeps it off Mindful Beginnings checkout until the
-- matching register.html change is deployed.
update public.sessions
set
  course = 'Ready. Period.',
  external_registration_url = 'https://www.districtdabblelab.com/service-page/blinged-prepped-ready-period-3?referral=service_list_widget',
  has_host = false,
  is_private = false,
  is_cancelled = false,
  notes = case
    when coalesce(notes, '') ilike '%RN instructors only%' then notes
    else 'RN instructors only. ' || coalesce(notes, '')
  end
where code = 'RP-261023'
  and id = '998101b2-b0be-4c53-bd5b-d5b189efa2c3';
