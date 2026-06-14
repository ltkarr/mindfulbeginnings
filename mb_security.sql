-- ============================================================================
--  Mindful Beginnings — security migration
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  Contains three parts:
--    PART 1  Brute-force protection on the instructor PIN login.
--    PART 2  An owner-gated function so host address / cell / wifi / day-of
--            contact are only returned to the instructor assigned to that job.
--    PART 3  (OPTIONAL, read the warning) Lock the private host columns down so
--            the public anon key can no longer read them at all.
--
--  IMPORTANT: test on a Supabase branch or a preview first if you can, and read
--  the comments on each part before running. Parts 1 and 2 are safe to run now.
--  Part 3 must wait until admin.html no longer relies on reading those columns
--  with the anon key.
-- ============================================================================


-- ============================================================================
--  PART 1 — Rate-limited instructor login
-- ----------------------------------------------------------------------------
--  Today a 4-digit PIN is 10,000 guesses and nothing slows an attacker down.
--  This replaces instructor_login so it:
--    * looks up the caller's IP (from the forwarded request header),
--    * blocks that IP for 15 minutes after 6 failed attempts,
--    * clears the counter the moment a correct PIN is entered.
--
--  The client call does NOT change — it still does
--      sb.rpc('instructor_login', { p_pin: pin })
--  and still receives the instructor profile (without the PIN) or null.
--
--  ASSUMPTIONS (near-certain from the app, but confirm): the table is named
--  "instructors" and the PIN column is "pin" (text). The function returns the
--  whole row as JSON minus the pin, so adding columns later needs no change.
-- ----------------------------------------------------------------------------

create table if not exists mb_login_attempts (
  ip            text primary key,
  fail_count    int          not null default 0,
  first_fail    timestamptz  not null default now(),
  locked_until  timestamptz
);

create or replace function instructor_login(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text;
  v_profile  jsonb;
  v_row      mb_login_attempts%rowtype;
  v_window   interval := interval '15 minutes';
  v_max      int      := 6;
  v_lockout  interval := interval '15 minutes';
begin
  -- Best-effort client IP from the forwarded header; first value if it is a list.
  v_ip := split_part(
            coalesce((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), 'unknown'),
            ',', 1);
  v_ip := nullif(btrim(v_ip), '');
  if v_ip is null then v_ip := 'unknown'; end if;

  -- Is this IP currently locked out?
  select * into v_row from mb_login_attempts where ip = v_ip;
  if found and v_row.locked_until is not null and v_row.locked_until > now() then
    return null;  -- the page shows the normal "PIN not recognized" message
  end if;

  -- Validate the PIN.
  select to_jsonb(i) - 'pin' into v_profile
  from instructors i
  where i.pin = p_pin
  limit 1;

  if v_profile is not null then
    -- Success: clear any failure record for this IP.
    delete from mb_login_attempts where ip = v_ip;
    return v_profile;
  end if;

  -- Failure: count it (resetting the window if the last failure was long ago).
  insert into mb_login_attempts (ip, fail_count, first_fail)
  values (v_ip, 1, now())
  on conflict (ip) do update set
    fail_count = case
                   when mb_login_attempts.first_fail < now() - v_window then 1
                   else mb_login_attempts.fail_count + 1
                 end,
    first_fail = case
                   when mb_login_attempts.first_fail < now() - v_window then now()
                   else mb_login_attempts.first_fail
                 end;

  -- Lock the IP if it has now crossed the threshold inside the window.
  update mb_login_attempts
     set locked_until = now() + v_lockout
   where ip = v_ip
     and fail_count >= v_max;

  return null;
end;
$$;

grant execute on function instructor_login(text) to anon;

-- The attempts table is internal bookkeeping; the anon key should never read it.
revoke all on table mb_login_attempts from anon;

-- TEST after running (replace with a real PIN): should return the profile JSON.
--   select instructor_login('1234');
-- A wrong PIN should return null, and six wrong tries in a row should keep
-- returning null even once you switch to the correct PIN, until 15 minutes pass.


-- ============================================================================
--  PART 2 — Owner-gated host details
-- ----------------------------------------------------------------------------
--  Host address, host cell, wifi, and day-of contact should only be visible to
--  the instructor actually assigned to that session. This mirrors the existing
--  instructor_get_roster pattern: it checks the PIN, confirms the caller owns
--  the job, and only then returns the private fields. The updated instructor.html
--  already calls this from printRoster().
--
--  Session id is compared as text so this works whether your id column is uuid
--  or text. Confirm your column names match (host_address, host_phone,
--  wifi_info, contact_day) — adjust if yours differ.
-- ----------------------------------------------------------------------------

create or replace function instructor_session_private(p_pin text, p_session_id text)
returns table (
  host_address text,
  host_phone   text,
  wifi_info    text,
  contact_day  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instr text;
begin
  select i.id::text into v_instr from instructors i where i.pin = p_pin limit 1;
  if v_instr is null then
    return;  -- bad PIN: return nothing
  end if;

  return query
  select s.host_address, s.host_phone, s.wifi_info, s.contact_day
  from sessions s
  join job_data j on j.session_id = s.id
  where s.id::text = p_session_id
    and j.instructor_id::text = v_instr;
end;
$$;

grant execute on function instructor_session_private(text, text) to anon;

-- TEST (replace with a real PIN and a session id the instructor owns):
--   select * from instructor_session_private('1234', 'the-session-id');


-- ============================================================================
--  PART 3 — Lock the private host columns down  (OPTIONAL — READ FIRST)
-- ----------------------------------------------------------------------------
--  Right now anyone holding the public anon key (which ships in the page source)
--  can read EVERY column of the sessions table, including host_phone,
--  contact_name, wifi_info, and contact_day. The updated register.html and
--  instructor.html no longer request those columns, and the instructor portal
--  now gets them through the gated function in Part 2 instead. So the only
--  remaining reader to check is admin.html.
--
--  ⚠️  DO NOT RUN THIS until admin.html either (a) uses a privileged/admin login
--      rather than the anon key, or (b) reads these fields through a gated RPC.
--      If admin.html reads sessions with the anon key, this will blank those
--      fields in your admin panel. Share admin.html and this can be finished
--      safely.
--
--  Postgres only enforces column-level SELECT when the grant ITSELF is
--  column-level, so the pattern is: revoke the whole-table grant, then grant
--  back every column EXCEPT the private ones. Because the exact column list
--  depends on your schema, do it in two steps:
--
--  STEP A — list your columns:
--      select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
--      from information_schema.columns
--      where table_schema = 'public' and table_name = 'sessions'
--        and column_name not in ('host_phone','contact_name','wifi_info','contact_day');
--
--  STEP B — paste the result from Step A into the grant below, then run both lines:
--      revoke select on sessions from anon;
--      grant  select (/* paste columns from Step A here */) on sessions to anon;
--
--  host_address is intentionally KEPT readable, because the registration page
--  shows families where the class is. If you would rather hide the street
--  address until after payment too, add 'host_address' to the not-in list in
--  Step A and serve it to registrants through a gated RPC instead.
-- ============================================================================
