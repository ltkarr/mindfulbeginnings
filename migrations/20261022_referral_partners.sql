-- Referral partners and commission attribution.
--
-- A referral partner is a name, the referral-source values that belong to
-- them, and their share of what is left after overhead. Mary Parks is seeded
-- at 40 percent for the source "Vanessa in Vienna". Lindsay keeps the other
-- 60 percent. This is separate from liaisons (public.partners).
--
-- Host sites and organizations live on class_requests (kind host or
-- organization). Their referral answer is payload.referral. Individual
-- answers live on registrations.referral_source. A session created from a
-- request copies "Referral: ..." into sessions.admin_private_notes.
--
-- The partner PIN is created in the admin and handed over by Lindsay.
-- Nothing in this migration sends email. Anon cannot read these tables.
-- The portal calls referral_partner_report(pin) and receives only that
-- partner's published snapshot.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  split_pct numeric not null default 0.40 check (split_pct >= 0 and split_pct <= 1),
  pin text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_partner_sources (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  source_value text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_partner_sources_value_idx
  on public.referral_partner_sources (lower(btrim(source_value)));

create table if not exists public.referral_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  line_key text not null,
  amount numeric not null default 0,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (partner_id, line_key)
);

create table if not exists public.referral_commission_snapshots (
  partner_id uuid primary key references public.referral_partners(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_overhead_rules (
  id integer primary key default 1 check (id = 1),
  instructor_pay boolean not null default true,
  material_allowance boolean not null default true,
  session_expenses boolean not null default true,
  net_of_processing_fees boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.registrations
  add column if not exists referral_partner_id uuid references public.referral_partners(id);

alter table public.sessions
  add column if not exists referral_partner_id uuid references public.referral_partners(id);

alter table public.class_requests
  add column if not exists referral_partner_id uuid references public.referral_partners(id);

create index if not exists registrations_referral_partner_idx
  on public.registrations (referral_partner_id);
create index if not exists sessions_referral_partner_idx
  on public.sessions (referral_partner_id);
create index if not exists class_requests_referral_partner_idx
  on public.class_requests (referral_partner_id);

insert into public.referral_partners (id, name, split_pct, active, notes)
values (
  'b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f',
  'Mary Parks',
  0.40,
  true,
  'Referral partner for the Vanessa in Vienna source. Create her portal PIN from Admin, More, Referral partners. Nothing is emailed.'
)
on conflict (id) do update
  set name = excluded.name,
      split_pct = excluded.split_pct,
      active = true;

insert into public.referral_partner_sources (partner_id, source_value)
select 'b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f', 'Vanessa in Vienna'
where not exists (
  select 1 from public.referral_partner_sources
  where lower(btrim(source_value)) = 'vanessa in vienna'
);

insert into public.referral_overhead_rules (id)
values (1)
on conflict (id) do nothing;

-- Match a stored answer to one configured source. Same rules as
-- js/referral-commissions.js referralSourceMatches.
create or replace function public.referral_text_matches(raw text, source_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  src text := lower(btrim(coalesce(source_value, '')));
  blob text := lower(coalesce(raw, ''));
  stripped text;
  heard text;
  words text[];
  w text;
  long_words int := 0;
begin
  src := regexp_replace(src, '\s+', ' ', 'g');
  if src = '' or btrim(coalesce(raw, '')) = '' then
    return false;
  end if;
  blob := btrim(regexp_replace(blob, '\s+', ' ', 'g'));
  if blob = src then
    return true;
  end if;
  stripped := btrim(regexp_replace(blob, '^(other(/referral)?)\s*:\s*', '', 'i'));
  if stripped = src then
    return true;
  end if;
  heard := substring(blob from '\[how they heard about us:\s*([^\]]+)\]');
  if heard is not null and btrim(heard) = src then
    return true;
  end if;
  if position(src in blob) > 0 then
    return true;
  end if;
  words := regexp_split_to_array(src, ' ');
  foreach w in array words loop
    if length(w) > 2 then
      long_words := long_words + 1;
      if position(w in blob) = 0 then
        return false;
      end if;
    end if;
  end loop;
  return long_words >= 2;
end;
$$;

create or replace function public.referral_partner_for_text(raw text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.referral_partners p
  join public.referral_partner_sources s on s.partner_id = p.id
  where p.active
    and public.referral_text_matches(raw, s.source_value)
  order by length(btrim(s.source_value)) desc
  limit 1;
$$;

create or replace function public.referral_labeled_text(raw text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(m[1], E'\n'), '')
  from regexp_matches(coalesce(raw, ''), '^\s*referral\s*:\s*(.+)$', 'gin') as m;
$$;

create or replace function public.referrals_attribute_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  heard text;
begin
  heard := substring(coalesce(new.notes, '') from '\[How they heard about us:\s*([^\]]+)\]');
  new.referral_partner_id := coalesce(
    public.referral_partner_for_text(new.referral_source),
    public.referral_partner_for_text(heard)
  );
  return new;
end;
$$;

drop trigger if exists registrations_attribute_referral on public.registrations;
create trigger registrations_attribute_referral
  before insert or update of referral_source, notes
  on public.registrations
  for each row
  execute function public.referrals_attribute_registration();

create or replace function public.referrals_attribute_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  labeled text := public.referral_labeled_text(new.admin_private_notes);
  found uuid := public.referral_partner_for_text(labeled);
begin
  if found is not null then
    new.referral_partner_id := found;
  elsif btrim(coalesce(labeled, '')) <> '' then
    new.referral_partner_id := null;
  elsif new.referral_partner_id is not null then
    null;
  elsif tg_op = 'UPDATE' then
    new.referral_partner_id := old.referral_partner_id;
  else
    new.referral_partner_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_attribute_referral on public.sessions;
create trigger sessions_attribute_referral
  before insert or update
  on public.sessions
  for each row
  execute function public.referrals_attribute_session();

create or replace function public.referrals_attribute_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.referral_partner_id := public.referral_partner_for_text(new.payload->>'referral');
  if new.session_id is not null and new.referral_partner_id is not null then
    update public.sessions
       set referral_partner_id = new.referral_partner_id
     where id = new.session_id
       and (referral_partner_id is null or referral_partner_id = new.referral_partner_id);
  end if;
  return new;
end;
$$;

drop trigger if exists class_requests_attribute_referral on public.class_requests;
create trigger class_requests_attribute_referral
  before insert or update of payload, session_id
  on public.class_requests
  for each row
  execute function public.referrals_attribute_request();

-- Backfill anything already carrying this referral.
update public.registrations r
   set referral_partner_id = coalesce(
     public.referral_partner_for_text(r.referral_source),
     public.referral_partner_for_text(substring(coalesce(r.notes, '') from '\[How they heard about us:\s*([^\]]+)\]'))
   )
 where public.referral_partner_for_text(r.referral_source) is not null
    or public.referral_partner_for_text(substring(coalesce(r.notes, '') from '\[How they heard about us:\s*([^\]]+)\]')) is not null;

update public.class_requests c
   set referral_partner_id = public.referral_partner_for_text(c.payload->>'referral')
 where public.referral_partner_for_text(c.payload->>'referral') is not null;

update public.sessions s
   set referral_partner_id = public.referral_partner_for_text(public.referral_labeled_text(s.admin_private_notes))
 where public.referral_partner_for_text(public.referral_labeled_text(s.admin_private_notes)) is not null;

update public.sessions s
   set referral_partner_id = c.referral_partner_id
  from public.class_requests c
 where c.session_id = s.id
   and c.referral_partner_id is not null
   and s.referral_partner_id is null;

alter table public.referral_partners enable row level security;
alter table public.referral_partner_sources enable row level security;
alter table public.referral_commission_payouts enable row level security;
alter table public.referral_commission_snapshots enable row level security;
alter table public.referral_overhead_rules enable row level security;

revoke all on table public.referral_partners from anon, public;
revoke all on table public.referral_partner_sources from anon, public;
revoke all on table public.referral_commission_payouts from anon, public;
revoke all on table public.referral_commission_snapshots from anon, public;
revoke all on table public.referral_overhead_rules from anon, public;

grant select, insert, update, delete on table public.referral_partners to authenticated;
grant select, insert, update, delete on table public.referral_partner_sources to authenticated;
grant select, insert, update, delete on table public.referral_commission_payouts to authenticated;
grant select, insert, update, delete on table public.referral_commission_snapshots to authenticated;
grant select, insert, update, delete on table public.referral_overhead_rules to authenticated;

drop policy if exists "admin full access to referral_partners" on public.referral_partners;
create policy "admin full access to referral_partners"
  on public.referral_partners for all to authenticated
  using (true) with check (true);

drop policy if exists "admin full access to referral_partner_sources" on public.referral_partner_sources;
create policy "admin full access to referral_partner_sources"
  on public.referral_partner_sources for all to authenticated
  using (true) with check (true);

drop policy if exists "admin full access to referral_commission_payouts" on public.referral_commission_payouts;
create policy "admin full access to referral_commission_payouts"
  on public.referral_commission_payouts for all to authenticated
  using (true) with check (true);

drop policy if exists "admin full access to referral_commission_snapshots" on public.referral_commission_snapshots;
create policy "admin full access to referral_commission_snapshots"
  on public.referral_commission_snapshots for all to authenticated
  using (true) with check (true);

drop policy if exists "admin full access to referral_overhead_rules" on public.referral_overhead_rules;
create policy "admin full access to referral_overhead_rules"
  on public.referral_overhead_rules for all to authenticated
  using (true) with check (true);

revoke select (referral_partner_id) on public.sessions from anon, public;
revoke select (referral_partner_id) on public.registrations from anon, public;

-- Portal read. Returns that partner's snapshot only. A wrong PIN returns null.
create or replace function public.referral_partner_report(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  pname text;
  split numeric;
  snap jsonb;
begin
  if p_pin is null or length(btrim(p_pin)) < 4 then
    return null;
  end if;
  select id, name, split_pct
    into pid, pname, split
  from public.referral_partners
  where active
    and pin = btrim(p_pin);
  if pid is null then
    return null;
  end if;
  select payload into snap
  from public.referral_commission_snapshots
  where partner_id = pid;
  return jsonb_build_object(
    'partnerId', pid,
    'partnerName', pname,
    'splitPct', split,
    'role', 'referral_partner',
    'report', coalesce(snap, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.referral_partner_report(text) from public;
grant execute on function public.referral_partner_report(text) to anon, authenticated;

-- Admin only. Creates or clears the PIN Lindsay hands over herself.
create or replace function public.referral_partner_set_pin(p_id uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := btrim(coalesce(p_pin, ''));
begin
  if auth.role() is distinct from 'authenticated' then
    return 'forbidden';
  end if;
  if not exists (select 1 from public.referral_partners where id = p_id) then
    return 'missing';
  end if;
  if cleaned = '' then
    update public.referral_partners set pin = null where id = p_id;
    return 'cleared';
  end if;
  if cleaned !~ '^[0-9]{6}$' then
    return 'invalid';
  end if;
  if cleaned ~ '^([0-9])\1{5}$'
     or cleaned in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210') then
    return 'invalid';
  end if;
  if exists (select 1 from public.instructors where pin = cleaned)
     or exists (select 1 from public.partners where pin = cleaned)
     or exists (select 1 from public.referral_partners where pin = cleaned and id <> p_id) then
    return 'taken';
  end if;
  update public.referral_partners set pin = cleaned where id = p_id;
  return 'ok';
end;
$$;

revoke all on function public.referral_partner_set_pin(uuid, text) from public, anon;
grant execute on function public.referral_partner_set_pin(uuid, text) to authenticated;

revoke all on function public.referral_partner_for_text(text) from public, anon;
grant execute on function public.referral_partner_for_text(text) to authenticated;

notify pgrst, 'reload schema';
