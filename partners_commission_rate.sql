-- Per-partner liaison commission rate (fraction of net after direct booking costs).
-- Already applied in the live database as migration add_partner_commission_rate
-- (20260917183510). Kept here so the repo documents the column.
--
-- Null = use the admin engine default PARTNER_FLAT_RATE (0.20 = 20% of net).
-- Example: 0.40 pays the partner 40% of net; Mindful Beginnings keeps 60%.
-- Do not store 0.20 on a partner who should stay on the default — leave them null.

alter table public.partners
  add column if not exists commission_rate numeric;

comment on column public.partners.commission_rate is
  'Partner share of net after direct booking costs (e.g. 0.40 = 40%). Null means use admin default PARTNER_FLAT_RATE.';
