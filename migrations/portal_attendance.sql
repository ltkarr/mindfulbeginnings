-- ============================================================================
--  Mindful Beginnings — digital attendance / check-in
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates `session_attendance` — one row per student per session, marked
--       present/absent by the instructor from the portal ("Take attendance").
--    2. Adds two PIN-gated RPCs mirroring the existing instructor_get_roster /
--       instructor_session_private pattern: the caller's PIN is checked and the
--       session must be assigned to that instructor, otherwise nothing is
--       returned or saved.
--
--  SAFE TO RUN: yes. Creates one new table and two functions; touches nothing
--  that already exists.
-- ============================================================================

create table if not exists session_attendance (
  id           uuid        primary key default gen_random_uuid(),
  session_id   text        not null,
  student_name text        not null,
  status       text        not null default 'present'
               check (status in ('present','absent')),
  marked_by    text,
  marked_at    timestamptz not null default now(),
  unique (session_id, student_name)
);

alter table session_attendance enable row level security;

-- Instructors never touch this table directly — only through the RPCs below.
-- The admin page (same anon key as the rest of the app) can read it so Lindsay
-- can see who showed up.
drop policy if exists "att_admin_read" on session_attendance;
create policy "att_admin_read"
  on session_attendance for select
  using (true);

-- ----------------------------------------------------------------------------
--  Read saved attendance for one session (instructor must own the job).
-- ----------------------------------------------------------------------------
create or replace function instructor_get_attendance(p_pin text, p_session_id text)
returns table (
  student_name text,
  status       text,
  marked_at    timestamptz
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

  -- Caller must be the assigned instructor for this session.
  perform 1
  from job_data j
  where j.session_id::text = p_session_id
    and j.instructor_id::text = v_instr;
  if not found then
    return;
  end if;

  return query
  select a.student_name, a.status, a.marked_at
  from session_attendance a
  where a.session_id = p_session_id;
end;
$$;

grant execute on function instructor_get_attendance(text, text) to anon;

-- ----------------------------------------------------------------------------
--  Save attendance for one session (instructor must own the job).
--  p_attendance: [{"student_name":"...","status":"present"|"absent"}, ...]
-- ----------------------------------------------------------------------------
create or replace function instructor_save_attendance(p_pin text, p_session_id text, p_attendance jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instr text;
  v_row   jsonb;
  v_name  text;
  v_stat  text;
begin
  select i.id::text into v_instr from instructors i where i.pin = p_pin limit 1;
  if v_instr is null then
    return false;  -- bad PIN
  end if;

  perform 1
  from job_data j
  where j.session_id::text = p_session_id
    and j.instructor_id::text = v_instr;
  if not found then
    return false;  -- not this instructor's job
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_attendance, '[]'::jsonb))
  loop
    v_name := nullif(btrim(v_row ->> 'student_name'), '');
    v_stat := lower(coalesce(v_row ->> 'status', 'present'));
    if v_stat not in ('present', 'absent') then
      v_stat := 'present';
    end if;
    if v_name is not null then
      insert into session_attendance (session_id, student_name, status, marked_by)
      values (p_session_id, v_name, v_stat, v_instr)
      on conflict (session_id, student_name)
      do update set status = excluded.status,
                    marked_by = excluded.marked_by,
                    marked_at = now();
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function instructor_save_attendance(text, text, jsonb) to anon;

-- TEST after running (replace with a real PIN + a session id that instructor owns):
--   select * from instructor_get_attendance('1234', 'the-session-id');
--   select instructor_save_attendance('1234', 'the-session-id',
--     '[{"student_name":"Test Student","status":"present"}]'::jsonb);
