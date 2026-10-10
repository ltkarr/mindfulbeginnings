-- ============================================================================
--  Mindful Beginnings — when materials were put in the lock box
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--  Do not run this from the app. The admin keeps working before this is run:
--  the checkbox still saves, and the checked time appears after this column
--  exists.
--
--  WHAT THIS DOES:
--    The dashboard checklist already stores the materials check-off on
--    job_data.materials_sent (boolean). That is server-side, not localStorage,
--    so a phone and a PC already share the checked / not-checked state.
--
--    This adds job_data.materials_sent_at (timestamptz), the moment that box
--    was checked. Unchecking clears it. The session screen and the dashboard
--    read the same two fields.
--
--    Anon does not get this column. The instructor portal and the public
--    register page keep the existing job-board grants (session_id,
--    instructor_id, waitlist only).
--
--  SAFE TO RE-RUN: yes.
--
--  EXACT SQL:
-- ============================================================================

alter table public.job_data
  add column if not exists materials_sent_at timestamptz;

comment on column public.job_data.materials_sent_at is
  'When the admin checked Materials in lock box. Same check-off as materials_sent. Null when unchecked.';

revoke select (materials_sent_at), insert (materials_sent_at), update (materials_sent_at), references (materials_sent_at)
  on table public.job_data from anon, public;

grant select (materials_sent_at), insert (materials_sent_at), update (materials_sent_at)
  on table public.job_data to authenticated;
