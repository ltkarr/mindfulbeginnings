-- ============================================================================
--  Mindful Beginnings — Safe Sitter handbook shipping on one stored job line
--  Run in the Supabase SQL editor (Project → SQL editor → New query)
--  ONLY if that stored line should match the new $23.35 rate.
--  Do not run this to change what families are charged. Prices are not in
--  this update.
--
--  WHAT IS STORED:
--    Per-student materials rates are NOT columns on courses or sessions.
--    They live in admin.html and config.js:
--      Safe Sitter materialsCost     $20.35  (handbook)
--      Safe Sitter materialsShipping $3.00
--      total used by admin profit    $23.35
--
--    The only database row that still stores the old $20.35 rate is one
--    generated job-cost line:
--      sessions.code = SS-NORW-F26
--      course        custom job (not the Safe Sitter® course record)
--      additional_costs label
--        "Safe Sitter® materials — 8 × $20.35"
--      additional_costs amount  162.80   (8 × $20.35)
--
--    Company class profit ignores lines shaped like "materials — N × $".
--    This row is a custom job, so the $23.35 course rate is not applied on
--    top of it. Partner direct costs include the stored amount only if the
--    job is attributed to a liaison or an organization. originated_by and
--    hosted_for are blank on this row today, so this update does not move
--    a payout that already exists.
--
--    After this statement the line is 8 × $23.35 = $186.80.
--
--  SAFE TO RE-RUN: yes. It rewrites only that exact label and amount.
-- ============================================================================

update public.sessions
set additional_costs = (
  select jsonb_agg(
    case
      when elem->>'label' = 'Safe Sitter® materials — 8 × $20.35'
       and (elem->>'amount')::numeric = 162.8
      then jsonb_set(
        jsonb_set(elem, '{label}', to_jsonb('Safe Sitter® materials — 8 × $23.35'::text)),
        '{amount}',
        to_jsonb(186.8)
      )
      else elem
    end
  )
  from jsonb_array_elements(coalesce(additional_costs, '[]'::jsonb)) elem
)
where code = 'SS-NORW-F26'
  and additional_costs::text like '%8 × $20.35%';
