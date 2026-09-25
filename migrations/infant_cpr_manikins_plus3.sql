-- ============================================================================
--  Mindful Beginnings — three more infant CPR manikins (September 2026)
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Adds 3 to the owned quantity of the infant CPR manikin kit.
--    The admin Equipment screen matches this kit by a name containing
--    "infant" (same rule as MAT_KIND_RX.infant in admin.html).
--    The live row is named "Infant CPR Manikins".
--
--    If that row already notes the September 2026 purchase, the quantity
--    is left alone so the three new manikins are not counted twice.
--    If no infant kit exists yet, one is inserted as "Infant CPR Manikins"
--    with quantity 3, matching the other manikin names on the shelf
--    (Child Manikins, Adult Manikin, Infant CPR Manikins).
--
--  SAFE TO RE-RUN: yes. The purchase marker stops a second +3.
-- ============================================================================

do $$
declare
  rec public.equipment%rowtype;
  marker text := 'mb-infant-manikins-plus-3-2026-09';
begin
  select * into rec
  from public.equipment
  where name ~* 'infant'
  order by sort nulls last, created_at
  limit 1;

  if rec.id is not null then
    if coalesce(rec.notes, '') ilike '%purchased Sep 2026%'
       or coalesce(rec.notes, '') ilike '%' || marker || '%' then
      raise notice 'Infant manikins already include the Sep 2026 purchase (qty %). No change.', rec.qty;
      return;
    end if;

    update public.equipment
    set qty = qty + 3,
        notes = trim(both ' ' from concat_ws(' ', notes, 'Owned qty +3 (purchased Sep 2026).', marker))
    where id = rec.id;
    return;
  end if;

  insert into public.equipment (id, name, qty, notes, sort)
  values (
    gen_random_uuid(),
    'Infant CPR Manikins',
    3,
    'Owned qty +3 (purchased Sep 2026). ' || marker,
    coalesce((select max(sort) + 1 from public.equipment), 1)
  );
end $$;
