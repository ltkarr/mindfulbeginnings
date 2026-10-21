-- ============================================================================
--  Allow class_requests.status = 'pending'.
--
--  Submissions now save a pending request and do not create a session.
--  Approving in ADMIN creates the session. Databases that already ran
--  migrations/class_requests.sql still have the old status check, which
--  rejects 'pending'. This replaces that check.
--
--  SAFE TO RE-RUN: yes. It does not change session prices or session rows.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'class_requests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.class_requests drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.class_requests
  add constraint class_requests_status_check
  check (
    status in (
      'pending',
      'received',
      'session_created',
      'draft_ready',
      'email_sent',
      'instructor_open',
      'instructor_claimed',
      'done',
      'archived'
    )
  );
