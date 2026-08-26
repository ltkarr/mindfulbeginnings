-- Mindful Beginnings — program guide pricing cutover
-- Run this BEFORE deploying the updated admin.html and register.html.
-- created_at is bigint (epoch milliseconds), not a timestamp.

-- 1. Stop new sessions from ever saving without a creation time again.
alter table public.sessions
  alter column created_at set default (extract(epoch from now()) * 1000)::bigint;

-- 2. Stamp every existing session with Aug 1 2026, which is BEFORE the Aug 6
--    cutover. This changes nothing about what any current session charges --
--    it just makes the dashboard agree with what families were actually quoted.
update public.sessions set created_at = 1785542400000
where created_at is null;

-- 3. Sanity check. Every row should read as a sensible 2026 date.
--    If these come back in 1970, the value landed in seconds instead of
--    milliseconds -- stop and fix before deploying.
select code, course, date, created_at,
       to_timestamp(created_at / 1000) as created_readable
from public.sessions
order by created_at desc, date
limit 15;

-- 4. Confirm nothing was left behind.
select count(*) as still_null from public.sessions where created_at is null;
