-- One commission bucket. Marketing sources such as "Vanessa in Vienna" and
-- "Yard sign" move onto the liaison (public.partners) they belong to.
-- Commission for those sources is calculated in admin with the same
-- per-student 40% rule as a family who names the liaison.
--
-- Mary's referral_partners row is folded into her existing liaison row
-- (84ed4c3c-2a32-4675-9b78-a18578999e68). Her liaison PIN is left as it is.
-- The separate referral PIN is cleared after it is copied into the backup,
-- so that login cannot open a second report.
--
-- The old referral tables are not dropped. A full copy is kept in
-- referral_program_backup_* and those copies are not exposed through the API.
-- To reverse this, run migrations/20261028_merge_referral_partners_rollback.sql
-- in a session where mb.rollback_referral_merge is set to yes.

create table if not exists public.partner_sources (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  source_value text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_sources_value_idx
  on public.partner_sources (lower(btrim(source_value)));

create index if not exists partner_sources_partner_idx
  on public.partner_sources (partner_id);

alter table public.partner_sources enable row level security;
revoke all on table public.partner_sources from anon, public;
grant select, insert, update, delete on table public.partner_sources to authenticated;

drop policy if exists "admin full access to partner_sources" on public.partner_sources;
create policy "admin full access to partner_sources"
  on public.partner_sources for all to authenticated
  using (true) with check (true);

create table if not exists public.referral_partner_liaison_map (
  referral_partner_id uuid primary key,
  partner_id uuid not null references public.partners(id),
  mapped_at timestamptz not null default now()
);

alter table public.referral_partner_liaison_map enable row level security;
revoke all on table public.referral_partner_liaison_map from anon, public, authenticated;

-- Snapshots of the old program, taken once. Later edits to the old tables
-- do not overwrite the backup. No API role can read these.
create table if not exists public.referral_program_backup_partners as
  select * from public.referral_partners where false;
create table if not exists public.referral_program_backup_sources as
  select * from public.referral_partner_sources where false;
create table if not exists public.referral_program_backup_payouts as
  select * from public.referral_commission_payouts where false;
create table if not exists public.referral_program_backup_snapshots as
  select * from public.referral_commission_snapshots where false;
create table if not exists public.referral_program_backup_rules as
  select * from public.referral_overhead_rules where false;

create table if not exists public.referral_program_backup_links (
  table_name text not null,
  row_id text not null,
  referral_partner_id uuid,
  primary key (table_name, row_id)
);

insert into public.referral_program_backup_partners
select * from public.referral_partners
where not exists (select 1 from public.referral_program_backup_partners);

insert into public.referral_program_backup_sources
select * from public.referral_partner_sources
where not exists (select 1 from public.referral_program_backup_sources);

insert into public.referral_program_backup_payouts
select * from public.referral_commission_payouts
where not exists (select 1 from public.referral_program_backup_payouts);

insert into public.referral_program_backup_snapshots
select * from public.referral_commission_snapshots
where not exists (select 1 from public.referral_program_backup_snapshots);

insert into public.referral_program_backup_rules
select * from public.referral_overhead_rules
where not exists (select 1 from public.referral_program_backup_rules);

insert into public.referral_program_backup_links (table_name, row_id, referral_partner_id)
select 'registrations', r.id::text, r.referral_partner_id
from public.registrations r
where r.referral_partner_id is not null
on conflict (table_name, row_id) do nothing;

insert into public.referral_program_backup_links (table_name, row_id, referral_partner_id)
select 'sessions', s.id::text, s.referral_partner_id
from public.sessions s
where s.referral_partner_id is not null
on conflict (table_name, row_id) do nothing;

insert into public.referral_program_backup_links (table_name, row_id, referral_partner_id)
select 'class_requests', c.id::text, c.referral_partner_id
from public.class_requests c
where c.referral_partner_id is not null
on conflict (table_name, row_id) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array[
    'referral_program_backup_partners',
    'referral_program_backup_sources',
    'referral_program_backup_payouts',
    'referral_program_backup_snapshots',
    'referral_program_backup_rules',
    'referral_program_backup_links'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public, authenticated', t);
  end loop;
end $$;

-- Same person already on the liaison list: keep that row. Anyone else gets a
-- new liaison row and does not receive the old referral PIN.
insert into public.referral_partner_liaison_map (referral_partner_id, partner_id)
select r.id, p.id
from public.referral_partners r
join public.partners p
  on lower(btrim(p.name)) = lower(btrim(r.name))
where not exists (
  select 1 from public.referral_partner_liaison_map m
  where m.referral_partner_id = r.id
);

insert into public.partners (id, name, status, notes)
select r.id,
       r.name,
       case when r.active then 'active' else 'inactive' end,
       'Moved from referral partners. The old portal PIN was not copied.'
from public.referral_partners r
where not exists (
  select 1 from public.referral_partner_liaison_map m
  where m.referral_partner_id = r.id
)
on conflict (id) do nothing;

insert into public.referral_partner_liaison_map (referral_partner_id, partner_id)
select r.id, r.id
from public.referral_partners r
where not exists (
  select 1 from public.referral_partner_liaison_map m
  where m.referral_partner_id = r.id
)
and exists (select 1 from public.partners p where p.id = r.id);

do $$
declare
  mapped uuid;
begin
  if not exists (
    select 1 from public.partners
    where id = '84ed4c3c-2a32-4675-9b78-a18578999e68'
  ) then
    raise exception 'Mary Parks liaison row 84ed4c3c-2a32-4675-9b78-a18578999e68 was not found';
  end if;
  select partner_id into mapped
  from public.referral_partner_liaison_map
  where referral_partner_id = 'b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f';
  if mapped is distinct from '84ed4c3c-2a32-4675-9b78-a18578999e68' then
    raise exception 'Mary Parks referral row did not map onto her existing liaison row';
  end if;
end $$;

insert into public.partner_sources (partner_id, source_value)
select m.partner_id, btrim(s.source_value)
from public.referral_partner_sources s
join public.referral_partner_liaison_map m on m.referral_partner_id = s.partner_id
where btrim(coalesce(s.source_value, '')) <> ''
  and not exists (
    select 1 from public.partner_sources ps
    where ps.partner_id = m.partner_id
      and lower(btrim(ps.source_value)) = lower(btrim(s.source_value))
  );

-- Point stored ids at the liaison before the foreign key changes target.
alter table public.registrations drop constraint if exists registrations_referral_partner_id_fkey;
alter table public.sessions drop constraint if exists sessions_referral_partner_id_fkey;
alter table public.class_requests drop constraint if exists class_requests_referral_partner_id_fkey;

update public.registrations r
   set referral_partner_id = m.partner_id
  from public.referral_partner_liaison_map m
 where r.referral_partner_id = m.referral_partner_id
   and r.referral_partner_id is distinct from m.partner_id;

update public.sessions s
   set referral_partner_id = m.partner_id
  from public.referral_partner_liaison_map m
 where s.referral_partner_id = m.referral_partner_id
   and s.referral_partner_id is distinct from m.partner_id;

update public.class_requests c
   set referral_partner_id = m.partner_id
  from public.referral_partner_liaison_map m
 where c.referral_partner_id = m.referral_partner_id
   and c.referral_partner_id is distinct from m.partner_id;

update public.registrations r
   set referral_partner_id = null
 where r.referral_partner_id is not null
   and not exists (select 1 from public.partners p where p.id = r.referral_partner_id);

update public.sessions s
   set referral_partner_id = null
 where s.referral_partner_id is not null
   and not exists (select 1 from public.partners p where p.id = s.referral_partner_id);

update public.class_requests c
   set referral_partner_id = null
 where c.referral_partner_id is not null
   and not exists (select 1 from public.partners p where p.id = c.referral_partner_id);

alter table public.registrations
  add constraint registrations_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.partners(id) on delete set null;

alter table public.sessions
  add constraint sessions_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.partners(id) on delete set null;

alter table public.class_requests
  add constraint class_requests_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.partners(id) on delete set null;

-- New answers resolve to a liaison id, using that liaison's sources.
create or replace function public.referral_partner_for_text(raw text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.partners p
  join public.partner_sources s on s.partner_id = p.id
  where public.referral_text_matches(raw, s.source_value)
  order by length(btrim(s.source_value)) desc
  limit 1;
$$;

revoke all on function public.referral_partner_for_text(text) from public, anon;
grant execute on function public.referral_partner_for_text(text) to authenticated;

-- Fill ids that the text matches and that are still empty or still point at
-- the retired referral-partner id. Do not clear a name referral.
update public.registrations r
   set referral_partner_id = found.partner_id
  from (
    select r2.id,
           coalesce(
             public.referral_partner_for_text(r2.referral_source),
             public.referral_partner_for_text(substring(coalesce(r2.notes, '') from '\[How they heard about us:\s*([^\]]+)\]'))
           ) as partner_id
    from public.registrations r2
  ) found
 where r.id = found.id
   and found.partner_id is not null
   and r.referral_partner_id is distinct from found.partner_id;

update public.class_requests c
   set referral_partner_id = public.referral_partner_for_text(c.payload->>'referral')
 where public.referral_partner_for_text(c.payload->>'referral') is not null
   and c.referral_partner_id is distinct from public.referral_partner_for_text(c.payload->>'referral');

update public.sessions s
   set referral_partner_id = public.referral_partner_for_text(public.referral_labeled_text(s.admin_private_notes))
 where public.referral_partner_for_text(public.referral_labeled_text(s.admin_private_notes)) is not null
   and s.referral_partner_id is distinct from public.referral_partner_for_text(public.referral_labeled_text(s.admin_private_notes));

-- The separate referral login no longer publishes a report. The PIN itself
-- remains in the backup table. Liaison PINs on public.partners are not changed.
update public.referral_partners set pin = null where pin is not null;

create or replace function public.referral_partner_report(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Retired. Marketing-source commission is on the liaison statement.
  return null;
end;
$$;

revoke all on function public.referral_partner_report(text) from public;
grant execute on function public.referral_partner_report(text) to anon, authenticated;

notify pgrst, 'reload schema';
