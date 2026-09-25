-- ============================================================================
--  Mindful Beginnings — Infant CPR Manikins owned quantity is 7
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Sets the owned quantity of the existing Infant CPR Manikins row to 7.
--    Row id: 419e04a9-5916-450c-b2a3-65c292a235ec
--    That kit was owned at 4. Lindsay bought 3 more in September 2026.
--
--    A row already at 7 or higher is left alone, so this will not add
--    another three and will not lower a higher count.
--    Child Manikins, Adult Manikin, and the AV Kit are not touched.
--    No second infant row is inserted.
--
--  SAFE TO RE-RUN: yes. The qty < 7 guard stops a second change.
-- ============================================================================

update public.equipment
set qty = 7,
    notes = 'Owned qty 7 (was 4, plus 3 purchased Sep 2026).'
where id = '419e04a9-5916-450c-b2a3-65c292a235ec'
  and name = 'Infant CPR Manikins'
  and qty < 7;
