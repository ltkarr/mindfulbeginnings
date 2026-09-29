-- ============================================================================
--  Mindful Beginnings — how a family paid
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Adds three nullable columns on registrations so Lindsay can see where to
--    refund, without guessing from notes:
--      payment_method   paypal | venmo | zelle | check | other
--      payment_ref       transaction id, Venmo/Zelle memo, or check number
--      payment_detail    free text when payment_method is other (cash, Square, …)
--
--    paypal_tx_id stays the PayPal capture id. New PayPal checkouts also copy
--    that id into payment_ref and set payment_method to paypal.
--
--    Existing rows are left null. This script does not guess a method for
--    payments that were recorded before these columns existed.
--
--  SAFE TO RE-RUN: yes. Column adds, the check, and the grants are idempotent.
-- ============================================================================

alter table public.registrations
  add column if not exists payment_method text,
  add column if not exists payment_ref text,
  add column if not exists payment_detail text;

comment on column public.registrations.payment_method is
  'How this registration was paid: paypal, venmo, zelle, check, or other. Null on older rows and until a method is chosen.';
comment on column public.registrations.payment_ref is
  'Payment reference: PayPal capture id, Venmo/Zelle memo, or check number. Null when none was recorded.';
comment on column public.registrations.payment_detail is
  'Free-text description when payment_method is other.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'registrations_payment_method_check'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_payment_method_check
      check (
        payment_method is null
        or payment_method in ('paypal', 'venmo', 'zelle', 'check', 'other')
      );
  end if;
end $$;

-- Table-level grants already cover new columns. These column grants keep
-- admin (authenticated), public signup (anon), and the PayPal service role
-- able to read and write the fields if table grants are later narrowed.
grant select (payment_method, payment_ref, payment_detail),
      insert (payment_method, payment_ref, payment_detail),
      update (payment_method, payment_ref, payment_detail)
  on table public.registrations
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
