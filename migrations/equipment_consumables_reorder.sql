-- ============================================================================
--  Mindful Beginnings — handbook / notebook stock and reorder points
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds equipment.consumable, equipment.reorder_at, and
--       equipment.reorder_qty.
--       consumable: one-time supplies (handbooks, notebooks). Checking a
--       durable kit back in does not put these copies back on the shelf.
--       reorder_at: alert when on-hand or free stock is at or below this
--       number. Null means no reorder alert.
--       reorder_qty: how many to order when that alert fires.
--    2. Grants anon and authenticated the same column privileges the
--       existing equipment columns already have. Equipment uses
--       column-level grants. A missing grant makes select * fail for the
--       whole table, not just omit the new fields.
--    3. Inserts four consumable rows if those names are not already there:
--         Safe Sitter handbooks
--         Safe@Home handbooks
--         Grandparents handbooks
--         Safe Sitter notebooks
--       Owned quantity starts at 0 so Lindsay can type what is on the shelf.
--       Reorder point is 10 and the suggested order is 16. A row that
--       already exists is left alone, including its quantity.
--    Manikin and AV Kit quantities are not changed.
--
--  SAFE TO RE-RUN: yes. Column adds and grants are idempotent. Inserts
--  skip names that are already on the list.
-- ============================================================================

alter table public.equipment
  add column if not exists consumable boolean not null default false,
  add column if not exists reorder_at integer,
  add column if not exists reorder_qty integer;

comment on column public.equipment.consumable is
  'True for one-time supplies such as handbooks and notebooks. Returning a durable kit does not restore these.';

comment on column public.equipment.reorder_at is
  'Alert when on-hand or free stock is at or below this count. Null means no reorder alert.';

comment on column public.equipment.reorder_qty is
  'Suggested order quantity when stock is at or below reorder_at.';

grant select (consumable, reorder_at, reorder_qty),
      insert (consumable, reorder_at, reorder_qty),
      update (consumable, reorder_at, reorder_qty),
      references (consumable, reorder_at, reorder_qty)
  on public.equipment to anon, authenticated;

insert into public.equipment (id, name, qty, notes, sort, consumable, reorder_at, reorder_qty)
select v.id, v.name, 0, v.notes, v.sort, true, 10, 16
from (values
  ('11111111-1111-4111-8111-111111111101'::uuid, 'Safe Sitter handbooks', 'Consumable — one per student. Set owned quantity to what is on the shelf.', 50),
  ('11111111-1111-4111-8111-111111111102'::uuid, 'Safe@Home handbooks', 'Consumable — one per student. Set owned quantity to what is on the shelf.', 51),
  ('11111111-1111-4111-8111-111111111103'::uuid, 'Grandparents handbooks', 'Consumable — one per student. Set owned quantity to what is on the shelf.', 52),
  ('11111111-1111-4111-8111-111111111104'::uuid, 'Safe Sitter notebooks', 'Consumable — one per student. Set owned quantity to what is on the shelf.', 53)
) as v(id, name, notes, sort)
where not exists (
  select 1 from public.equipment e where e.name = v.name
);
