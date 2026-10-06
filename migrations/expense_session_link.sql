-- ============================================================================
--  Mindful Beginnings — link an expense to a session
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Adds expenses.session_id (nullable text) so an expense entered on
--    Finances can point at the session it belongs to.
--    Deleting that session clears the link (on delete set null). The expense
--    row stays.
--
--    Existing rows stay null. Nothing is guessed, backfilled, or deleted.
--
--    The expenses table already grants anon, authenticated, and service_role
--    at the table level, so a new column is readable and writable as soon as
--    it exists. The column grants below keep that true if table grants are
--    later narrowed to a column list. A missing grant on a column-restricted
--    table makes select * fail for the whole table.
--
--  SAFE TO RE-RUN: yes. The column add, the foreign key, the index, and the
--  grants are idempotent.
-- ============================================================================

alter table public.expenses
  add column if not exists session_id text;

comment on column public.expenses.session_id is
  'Optional session this expense belongs to. Null when the expense is not linked to a session. Cleared if that session is deleted.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_session_id_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_session_id_fkey
      foreign key (session_id) references public.sessions(id) on delete set null;
  end if;
end $$;

create index if not exists expenses_session_id_idx on public.expenses (session_id);

grant select (session_id), insert (session_id), update (session_id)
  on table public.expenses
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
