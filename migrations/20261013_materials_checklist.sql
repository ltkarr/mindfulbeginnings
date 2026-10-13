-- ============================================================================
--  Mindful Beginnings — materials put-out time, and class-type wrap-up
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--  Do not run this from the app. The admin keeps working before this is run:
--  the checkboxes still save, and the new fields appear after these columns
--  exist.
--
--  WHAT THIS DOES:
--    job_data.materials_sent is the Materials in lock box checkbox, shared by
--    the dashboard Materials checklist and the Packing list. This adds
--    job_data.materials_out_at (timestamptz), the moment that box was checked.
--    Unchecking clears it.
--
--    Wrap-up no longer asks every class for a Safe Sitter report.
--    job_data.rep_notified stays the Safe Sitter check.
--    job_data.badge_summary_sent is the Girl Scout / troop check.
--    job_data.red_cross_reported is the Red Cross check.
--    A class only shows and counts the checks that apply to it.
--
--    Anon does not get these columns. The instructor portal and the public
--    register page keep the existing job-board grants (session_id,
--    instructor_id, waitlist only).
--
--  SAFE TO RE-RUN: yes.
--
--  EXACT SQL:
-- ============================================================================

alter table public.job_data
  add column if not exists materials_out_at timestamptz;

alter table public.job_data
  add column if not exists badge_summary_sent boolean not null default false;

alter table public.job_data
  add column if not exists red_cross_reported boolean not null default false;

comment on column public.job_data.materials_out_at is
  'When the admin checked Materials in lock box. Same check-off as materials_sent. Null when unchecked.';

comment on column public.job_data.badge_summary_sent is
  'Wrap-up: sent the Girl Scout badge summary to the host. Only counts for troop classes.';

comment on column public.job_data.red_cross_reported is
  'Wrap-up: reported completions to Red Cross. Only counts for Red Cross courses.';

revoke select (materials_out_at), insert (materials_out_at), update (materials_out_at), references (materials_out_at)
  on table public.job_data from anon, public;

revoke select (badge_summary_sent), insert (badge_summary_sent), update (badge_summary_sent), references (badge_summary_sent)
  on table public.job_data from anon, public;

revoke select (red_cross_reported), insert (red_cross_reported), update (red_cross_reported), references (red_cross_reported)
  on table public.job_data from anon, public;

grant select (materials_out_at), insert (materials_out_at), update (materials_out_at)
  on table public.job_data to authenticated;

grant select (badge_summary_sent), insert (badge_summary_sent), update (badge_summary_sent)
  on table public.job_data to authenticated;

grant select (red_cross_reported), insert (red_cross_reported), update (red_cross_reported)
  on table public.job_data to authenticated;
