-- ============================================================================
--  Mindful Beginnings — GS-H4782 family / troop split
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Sets the pricing on session GS-H4782 only:
--      price_override   = 15   family checkout, per registration
--      org_portion       = 30   troop flat fee, per scout
--      billed_headcount  = 15   scouts on the troop invoice ($450)
--
--    It also turns off the custom-job flag and sets the course name to
--    Girl Scouts — First Aid Badge Workshop. A custom job treats
--    price_override as one flat organization total and ignores org_portion,
--    so those two columns have to change for $15 and $30 to be read as a
--    family price and a troop invoice. The bill-to name is already
--    Girl Scout Troop 34182 (Mary Polacek) and is left as it is.
--
--  WHAT THIS DOES NOT TOUCH:
--    date, time, is_hold, and hold_term. The class is already
--    Tuesday, December 8, 2026, 6:30–7:30pm, and it is not on hold.
--    is_private stays on, so the class stays off the public list.
--    Families register with the private link for code GS-H4782.
--
--  SAFE TO RE-RUN: yes. The update runs only while family price and
--  organization portion are both still blank. A second run does nothing.
-- ============================================================================

update public.sessions
set
  price_override = 15,
  org_portion = 30,
  billed_headcount = 15,
  is_custom_job = false,
  course = 'Girl Scouts — First Aid Badge Workshop'
where code = 'GS-H4782'
  and id = 'e76026bf-0c88-478b-b438-5f4bb46e2f57'
  and org_portion is null
  and price_override is null;
