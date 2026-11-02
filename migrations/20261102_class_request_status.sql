-- ============================================================================
--  Class request statuses for the simplified ADMIN cards.
--
--  The cards use one status: Received, Replied, Confirmed, Session built.
--  Existing "pending" rows become Received. Older status names stay allowed
--  so an in-flight approve can still write session_created. The admin screen
--  shows those older names as Received, Replied, Confirmed, or Session built.
--
--  SAFE TO RE-RUN: yes. It does not change session prices or session rows.
-- ============================================================================

update public.class_requests
  set status = 'received'
  where status = 'pending';

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
      'replied',
      'confirmed',
      'session_built',
      'session_created',
      'draft_ready',
      'email_sent',
      'instructor_open',
      'instructor_claimed',
      'done',
      'archived'
    )
  );
