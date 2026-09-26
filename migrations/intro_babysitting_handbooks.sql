-- ============================================================================
--  Mindful Beginnings — Intro to Babysitting handbooks
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Inserts the Intro to Babysitting handbook row when it is missing, so a
--    fresh database can reserve one copy per registered student.
--      id:  11111111-1111-4111-8111-111111111105
--      qty: 66
--      consumable: true
--    If that id or name is already on the shelf, quantity is left alone.
--    The row is only marked consumable. Production counts are not reset.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

insert into public.equipment (id, name, qty, notes, sort, consumable, reorder_at, reorder_qty)
select
  '11111111-1111-4111-8111-111111111105'::uuid,
  'Intro to Babysitting handbooks',
  66,
  'Consumable — one per student. Set owned quantity to what is on the shelf.',
  54,
  true,
  10,
  16
where not exists (
  select 1 from public.equipment e
  where e.id = '11111111-1111-4111-8111-111111111105'::uuid
     or e.name = 'Intro to Babysitting handbooks'
);

update public.equipment
set consumable = true
where (id = '11111111-1111-4111-8111-111111111105'::uuid
    or name = 'Intro to Babysitting handbooks')
  and consumable is distinct from true;
