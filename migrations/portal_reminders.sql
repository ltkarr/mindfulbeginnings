-- ============================================================================
--  Mindful Beginnings — automated day-before instructor reminders
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates `reminder_log` so the daily cron never emails the same
--       session twice.
--    2. Adds `get_tomorrow_reminders()` — a PIN-free, security-definer RPC
--       that returns every session happening TOMORROW with an assigned
--       instructor (name + email + class details + live student count),
--       excluding sessions already reminded today.
--
--  The Vercel cron (vercel.json) hits /api/remind-instructors once a day,
--  which calls this RPC and sends each reminder through EmailJS.
--
--  SAFE TO RUN: yes. Creates one table and one function; touches nothing
--  that already exists.
-- ============================================================================

create table if not exists reminder_log (
  id         uuid        primary key default gen_random_uuid(),
  session_id text        not null,
  sent_at    timestamptz not null default now()
);
create index if not exists reminder_log_session_idx on reminder_log (session_id);

alter table reminder_log enable row level security;

-- Only the server-side cron writes here (via the definer RPC below, which
-- bypasses RLS). No direct anon access at all.
-- Admins can read it from the SQL editor with the service role.

-- ----------------------------------------------------------------------------
--  Sessions happening tomorrow that still need a reminder email.
-- ----------------------------------------------------------------------------
create or replace function get_tomorrow_reminders()
returns table (
  session_id      text,
  instructor_name text,
  instructor_email text,
  course          text,
  class_date      text,
  class_time      text,
  location_text   text,
  student_count   bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id::text,
         i.name,
         i.email,
         s.course,
         s.date::text,
         s.time,
         trim(both ', ' from coalesce(s.location,'') ||
           case when coalesce(s.city,'') <> '' then ', ' || s.city else '' end),
         (select count(*)
          from registrations r
          where r.session_id::text = s.id::text
            and r.pay_status not in ('waitlist','cancelled'))
  from sessions s
  join job_data j on j.session_id::text = s.id::text
  join instructors i on i.id::text = j.instructor_id::text
  where s.date::date = (current_date + interval '1 day')::date
    and coalesce(s.is_cancelled, false) = false
    and coalesce(s.is_hold, false) = false
    and i.email is not null
    and btrim(i.email) <> ''
    -- never remind the same session twice in one day
    and not exists (
      select 1 from reminder_log l
      where l.session_id = s.id::text
        and l.sent_at::date = current_date
    );
end;
$$;

grant execute on function get_tomorrow_reminders() to anon;

-- The API route inserts here after each successful send.
create or replace function log_reminder_sent(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into reminder_log (session_id) values (p_session_id);
end;
$$;

grant execute on function log_reminder_sent(text) to anon;

-- TEST after running:
--   select * from get_tomorrow_reminders();
-- (Returns rows only when a session is dated tomorrow with an instructor.)
