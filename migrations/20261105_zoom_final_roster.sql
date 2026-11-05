-- ============================================================================
--  Mindful Beginnings — day-before Zoom final roster checkbox
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--  Do not run this from the app. The admin keeps working before this is run:
--  the other checklist boxes still save, and this box starts saving after the
--  column exists.
--
--  WHAT THIS DOES:
--    job_data.instr_final_roster_sent is the Zoom checklist box
--    "Day before — send final roster to instructor".
--    Checking it only records that Lindsay sent the roster herself.
--    Nothing in this migration sends email.
--
--    Anon does not get this column. The instructor portal and the public
--    register page keep the existing job-board grants (session_id,
--    instructor_id, waitlist only).
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

alter table public.job_data
  add column if not exists instr_final_roster_sent boolean not null default false;

comment on column public.job_data.instr_final_roster_sent is
  'Zoom checklist: Lindsay sent the day-before final roster to the instructor. Copy-only. Does not send email.';

revoke select (instr_final_roster_sent), insert (instr_final_roster_sent), update (instr_final_roster_sent), references (instr_final_roster_sent)
  on table public.job_data from anon, public;

grant select (instr_final_roster_sent), insert (instr_final_roster_sent), update (instr_final_roster_sent)
  on table public.job_data to authenticated;
