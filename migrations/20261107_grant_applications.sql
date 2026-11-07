-- ============================================================================
--  Grant applications on Finances. Owner and admin only.
--  Run in the Supabase SQL editor if this has not been applied yet.
--
--  WHAT THIS DOES:
--    1. Creates public.grant_applications. One row is one grant Lindsay is
--       researching, has applied to, or has heard back from.
--    2. Turns on row level security. The public anon key (the instructor
--       portal and the register page) cannot read or write this table.
--       Authenticated access uses private.is_portal_admin(), the same gate
--       as expenses: the owner in private.portal_admins, or
--       app_metadata.role = admin. It does not read user_metadata.
--       service_role bypasses row level security for server routes.
--    3. Seeds the grants known on November 7, 2026. HerRise's $15 fee is a
--       new expenses row, category Grants. The Amber Grant fee already on
--       the expense list stays one row and moves to category Grants, so it
--       is not counted twice.
--
--  Requires private.is_portal_admin() from
--  migrations/20261106_instructor_directions.sql.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

create table if not exists public.grant_applications (
  id text primary key,
  name text not null,
  funder text,
  link text,
  amount_requested numeric,
  application_fee_paid numeric,
  date_applied date,
  due_date date,
  decision_date date,
  status text not null default 'researching',
  amount_awarded numeric,
  notes text,
  expense_id text references public.expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grant_applications_status_check
    check (status in ('researching', 'applied', 'awarded', 'declined')),
  constraint grant_applications_amount_requested_check
    check (amount_requested is null or amount_requested >= 0),
  constraint grant_applications_application_fee_paid_check
    check (application_fee_paid is null or application_fee_paid >= 0),
  constraint grant_applications_amount_awarded_check
    check (amount_awarded is null or amount_awarded >= 0)
);

comment on table public.grant_applications is
  'Grant applications and awards for the Finances screen. Owner and admin only. The instructor portal uses the anon key and has no access. A fee greater than zero is also an expenses row in category Grants, linked by expense_id. Awarded amounts are income on the yearly finance view.';

comment on column public.grant_applications.expense_id is
  'expenses.id for the application fee. Null when no fee was paid. Deleting that expense clears this link and does not delete the grant.';

comment on column public.grant_applications.status is
  'researching, applied, awarded, or declined. Pending is researching or applied.';

create index if not exists grant_applications_expense_id_idx
  on public.grant_applications (expense_id);

alter table public.grant_applications enable row level security;

revoke all on table public.grant_applications from public, anon, authenticated;

grant select, insert, update, delete on table public.grant_applications to authenticated;
grant select, insert, update, delete on table public.grant_applications to service_role;

drop policy if exists "admin full access to grant_applications" on public.grant_applications;
create policy "admin full access to grant_applications"
  on public.grant_applications
  for all
  to authenticated
  using ((select private.is_portal_admin()))
  with check ((select private.is_portal_admin()));

-- HerRise fee. Skipped if that charge is already on the books.
insert into public.expenses (id, description, amount, date, category, created_at, recur_active)
select
  'grant-fee-herrise-microgrant',
  'HerRise MicroGrant application fee',
  15,
  '2026-11-07',
  'Grants',
  (extract(epoch from timestamptz '2026-11-07 16:00:00+00') * 1000)::bigint,
  true
where not exists (
  select 1
  from public.expenses e
  where e.id = 'grant-fee-herrise-microgrant'
     or (
       e.description = 'HerRise MicroGrant application fee'
       and e.amount = 15
       and e.date = '2026-11-07'
     )
);

-- The Amber Grant fee is already an expense. Move it to Grants. Do not insert another $15.
update public.expenses
set category = 'Grants'
where description = 'Amber Grant for Women Application Fee'
  and amount = 15
  and category is distinct from 'Grants';

insert into public.grant_applications (
  id, name, funder, link, amount_requested, application_fee_paid,
  date_applied, due_date, decision_date, status, amount_awarded, notes, expense_id
) values
  (
    'herrise-microgrant',
    'HerRise MicroGrant',
    'Her Suite Spot',
    'https://hersuitespot.com/herrise-microgrant/',
    1000,
    15,
    '2026-11-07',
    '2026-11-30',
    null,
    'applied',
    null,
    null,
    null
  ),
  (
    'montgomery-dhhs-1160876',
    'Montgomery County DHHS Open Solicitation #1160876',
    'Montgomery County DHHS',
    null,
    null,
    null,
    null,
    null,
    null,
    'researching',
    null,
    'Packet requested November 7, 2026.',
    null
  ),
  (
    'amber-grant',
    'Amber Grant',
    null,
    null,
    null,
    15,
    null,
    null,
    null,
    'applied',
    null,
    'Application fee paid October 6, 2026.',
    null
  ),
  (
    'ifundwomen',
    'IFundWomen',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'applied',
    null,
    null,
    null
  ),
  (
    'galaxy-grant',
    'Galaxy Grant',
    null,
    null,
    3500,
    0,
    null,
    '2027-01-31',
    null,
    'researching',
    null,
    'No application fee.',
    null
  )
on conflict (id) do nothing;

update public.grant_applications g
set expense_id = e.id
from public.expenses e
where g.id = 'herrise-microgrant'
  and g.expense_id is null
  and (
    e.id = 'grant-fee-herrise-microgrant'
    or (
      e.description = 'HerRise MicroGrant application fee'
      and e.amount = 15
      and e.date = '2026-11-07'
    )
  );

update public.grant_applications g
set
  expense_id = e.id,
  application_fee_paid = coalesce(g.application_fee_paid, e.amount)
from public.expenses e
where g.id = 'amber-grant'
  and e.description = 'Amber Grant for Women Application Fee'
  and e.amount = 15
  and (g.expense_id is null or g.expense_id = e.id);

notify pgrst, 'reload schema';
