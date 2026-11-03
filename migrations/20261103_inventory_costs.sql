-- ============================================================================
--  Mindful Beginnings — inventory cost for handbooks and certifications
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. inventory_items: a stock item such as a Safe Sitter handbook.
--    2. inventory_purchases: a quantity bought, usually tied to one expense.
--       The card charge stays on expenses (cash spent). Profit does not also
--       count that charge as overhead or as a session expense. Sessions take
--       the average cost per unit for the units they use.
--    3. course_inventory_use: how many of an item one student uses in a course.
--       Admin can change these rows. Nothing here changes a session price or
--       an instructor pay rate.
--    4. Seeds the three item types and the course map. It does not seed
--       purchase quantities. Existing expenses stay as expenses until an
--       admin enters a quantity.
--
--  ACCESS: same as admin_settings. The public anon key cannot read or write
--  these tables. A signed-in admin (authenticated) can. service_role can.
--
--  SAFE TO RE-RUN: yes. Tables, policies, grants, and seeds are idempotent.
-- ============================================================================

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_label text not null default 'unit',
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  expense_id text references public.expenses(id) on delete cascade,
  quantity numeric not null,
  amount numeric not null,
  purchased_on date not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_purchases_quantity_positive check (quantity > 0),
  constraint inventory_purchases_amount_nonnegative check (amount >= 0)
);

create table if not exists public.course_inventory_use (
  id uuid primary key default gen_random_uuid(),
  course_name text not null,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  qty_per_student numeric not null default 1,
  created_at timestamptz not null default now(),
  constraint course_inventory_use_qty_positive check (qty_per_student > 0),
  constraint course_inventory_use_course_item unique (course_name, item_id)
);

comment on table public.inventory_items is
  'Stock items whose cost is spread across sessions by units used. Admin only.';
comment on table public.inventory_purchases is
  'A quantity added to stock. expense_id points at the card charge when there is one. That charge is cash spent and is not also overhead.';
comment on table public.course_inventory_use is
  'How many units of an inventory item one enrolled student uses in a course. Editable by admin.';
comment on column public.inventory_purchases.expense_id is
  'Optional expenses.id. One expense can fund one stock lot. Deleting the expense removes the lot.';

create unique index if not exists inventory_items_name_lower_idx
  on public.inventory_items (lower(name));

create index if not exists inventory_purchases_item_id_idx
  on public.inventory_purchases (item_id);

create unique index if not exists inventory_purchases_expense_id_key
  on public.inventory_purchases (expense_id)
  where expense_id is not null;

create index if not exists course_inventory_use_item_id_idx
  on public.course_inventory_use (item_id);

alter table public.inventory_items enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.course_inventory_use enable row level security;

revoke all on table public.inventory_items from public, anon;
revoke all on table public.inventory_purchases from public, anon;
revoke all on table public.course_inventory_use from public, anon;

grant select, insert, update, delete on table public.inventory_items to authenticated, service_role;
grant select, insert, update, delete on table public.inventory_purchases to authenticated, service_role;
grant select, insert, update, delete on table public.course_inventory_use to authenticated, service_role;

drop policy if exists "admin full access to inventory_items" on public.inventory_items;
create policy "admin full access to inventory_items"
  on public.inventory_items
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin full access to inventory_purchases" on public.inventory_purchases;
create policy "admin full access to inventory_purchases"
  on public.inventory_purchases
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin full access to course_inventory_use" on public.course_inventory_use;
create policy "admin full access to course_inventory_use"
  on public.course_inventory_use
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.inventory_items (id, name, unit_label, sort)
values
  ('11111111-1111-4111-8111-000000000001', 'Safe Sitter handbook', 'handbook', 1),
  ('11111111-1111-4111-8111-000000000002', 'Red Cross Babysitter handbook', 'handbook', 2),
  ('11111111-1111-4111-8111-000000000003', 'Red Cross CPR certification', 'certification', 3)
on conflict (id) do nothing;

insert into public.course_inventory_use (course_name, item_id, qty_per_student)
values
  ('Safe Sitter®', '11111111-1111-4111-8111-000000000001', 1),
  ('Safe Sitter® Babysitting Essentials', '11111111-1111-4111-8111-000000000001', 1),
  ('Babysitter''s Training', '11111111-1111-4111-8111-000000000002', 1),
  ('Red Cross Babysitter''s Training + Pediatric First Aid/CPR/AED', '11111111-1111-4111-8111-000000000002', 1),
  ('Red Cross Babysitter''s Training + Pediatric First Aid/CPR/AED (Online + Classroom)', '11111111-1111-4111-8111-000000000002', 1),
  ('Babysitter''s Training', '11111111-1111-4111-8111-000000000003', 1),
  ('Red Cross Babysitter''s Training + Pediatric First Aid/CPR/AED', '11111111-1111-4111-8111-000000000003', 1),
  ('Red Cross Babysitter''s Training + Pediatric First Aid/CPR/AED (Online + Classroom)', '11111111-1111-4111-8111-000000000003', 1),
  ('Adult & Pediatric First Aid/CPR/AED Certification', '11111111-1111-4111-8111-000000000003', 1),
  ('Adult First Aid/CPR/AED Certification', '11111111-1111-4111-8111-000000000003', 1),
  ('Basic Life Support (BLS) Certification', '11111111-1111-4111-8111-000000000003', 1),
  ('Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)', '11111111-1111-4111-8111-000000000003', 1),
  ('Adult First Aid/CPR/AED Certification (Hybrid)', '11111111-1111-4111-8111-000000000003', 1),
  ('Basic Life Support (BLS) Certification (Hybrid)', '11111111-1111-4111-8111-000000000003', 1),
  ('Group CPR Certification for Workplaces', '11111111-1111-4111-8111-000000000003', 1)
on conflict (course_name, item_id) do nothing;

notify pgrst, 'reload schema';
