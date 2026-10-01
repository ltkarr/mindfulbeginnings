-- ============================================================================
--  Mindful Beginnings — organization share per girl (split billing)
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds sessions.org_portion (nullable numeric). Dollars per girl the
--       organization pays, separate from sessions.price_override, which stays
--       the amount a family pays at checkout.
--       Blank means a full organization bill: headcount × the registration
--       price (Congregation Beth El). A number means a split: families pay
--       the registration price, and the organization is invoiced for this
--       amount × the roster count.
--    2. Sets SS-261009 (Oct 9 2026 Safe Sitter, GS Troop 42086) to $25 per
--       girl. Families already check out at the $150 price override. The
--       roster count of 6 is left as entered, so the organization bill is
--       25 × 6 = 150. Class capacity is not used.
--    3. Does not grant the column to anon or public. Public registration
--       reads an explicit column list and charges price_override. Anon SELECT
--       on sessions is column-level, so a new column with no anon grant stays
--       off the register page and the instructor portal.
--    4. Grants the column to authenticated (the admin login). Authenticated
--       already has table-level access; the explicit grant keeps admin reads
--       and saves working if those grants are later narrowed to a column list.
--
--  SAFE TO RE-RUN: yes. The column add, grants, and the SS-261009 update
--  (only while org_portion is still null) are idempotent.
-- ============================================================================

alter table public.sessions
  add column if not exists org_portion numeric;

comment on column public.sessions.org_portion is
  'Dollars per girl the organization pays. Null means the organization is billed the registration price. Public registration does not read this column.';

-- Column form only. A table-level REVOKE SELECT from anon would also wipe the
-- existing per-column grants the instructor portal and register page rely on.
revoke select (org_portion), insert (org_portion), update (org_portion), references (org_portion)
  on table public.sessions from anon, public;

grant select (org_portion), insert (org_portion), update (org_portion)
  on table public.sessions to authenticated;

-- GS Troop 42086 / Lynne Chandler. Families pay price_override ($150).
-- The troop pays $25 per girl on the roster already stored in billed_headcount.
update public.sessions
set org_portion = 25
where code = 'SS-261009'
  and org_portion is null
  and price_override = 150
  and billed_headcount = 6;

notify pgrst, 'reload schema';
