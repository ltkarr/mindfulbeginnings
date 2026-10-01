-- ============================================================================
--  Mindful Beginnings — how an overhead expense was paid
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Adds expenses.payment_method (nullable text) so Lindsay can record how
--    an overhead expense was paid:
--      amex | visa | paypal | check | zelle | venmo
--
--    Existing rows stay null. Nothing is guessed or backfilled.
--
--    The expenses table already grants anon, authenticated, and service_role
--    at the table level, so a new column is readable and writable as soon as
--    it exists. The column grants below keep that true if table grants are
--    later narrowed to a column list. A missing grant on a column-restricted
--    table makes select * fail for the whole table.
--
--  SAFE TO RE-RUN: yes. The column add, the check, and the grants are idempotent.
-- ============================================================================

alter table public.expenses
  add column if not exists payment_method text;

comment on column public.expenses.payment_method is
  'How this overhead expense was paid: amex, visa, paypal, check, zelle, or venmo. Null when not recorded.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_payment_method_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_payment_method_check
      check (
        payment_method is null
        or payment_method in ('amex', 'visa', 'paypal', 'check', 'zelle', 'venmo')
      );
  end if;
end $$;

grant select (payment_method), insert (payment_method), update (payment_method)
  on table public.expenses
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
