-- Single-use discount codes. Safe to run more than once.
-- Nothing here sends email.
--
-- How a code is redeemed
-- ---------------------
-- A code is created unused (admin, More → Discount codes). Default amount
-- off is $25. The public registration page can check a code, but checking
-- does not use it.
--
-- The code is reserved in the same transaction that writes the discounted
-- price onto one registration. The reserve is a single update that matches
-- only status = 'unused', and the code row is locked FOR UPDATE first, so
-- two registrations cannot take it. The loser gets "already been used."
-- The price stored is max(0, list price − the code's amount). When the
-- session has price_override, that is the list price. Otherwise the list
-- price is the class total the registration page calculated. The client
-- never chooses the discount amount.
--
-- Reserved means held for that registration. It cannot be used on another.
-- It becomes used when that registration is marked paid (PayPal capture,
-- Venmo/Zelle confirmed in the admin, or a $0 discount the family confirms).
-- Used does not go back to unused, including if the seat is later cancelled.
--
-- A reserved code returns to unused when:
--   - the family removes it before payment, or
--   - the registration is cancelled, refunded, or moved to the waitlist
--     before it was paid, or
--   - the registration row is deleted while the code is still only reserved, or
--   - Lindsay deactivates it (a held registration goes back to the class price).
-- A signup that never saves a registration does not reserve a code.
-- Closing the page after a successful reserve leaves the code on that
-- registration at the discounted price. That is the amount Venmo, Zelle,
-- card, and PayPal are asked to charge, and the amount reports use
-- (registrations.price_paid). Host, comp, auction, and waitlist seats
-- cannot take a code.

alter table public.registrations
  add column if not exists discount_code text;

comment on column public.registrations.discount_code is
  'Single-use discount code reserved or used by this registration. The client cannot set it.';

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  amount numeric(10,2) not null default 25,
  note text,
  status text not null default 'unused',
  registration_id text,
  student_name text,
  session_id text,
  list_price numeric(10,2),
  payable numeric(10,2),
  reserved_at timestamptz,
  used_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.discount_codes add column if not exists amount numeric(10,2) not null default 25;
alter table public.discount_codes add column if not exists note text;
alter table public.discount_codes add column if not exists status text not null default 'unused';
alter table public.discount_codes add column if not exists registration_id text;
alter table public.discount_codes add column if not exists student_name text;
alter table public.discount_codes add column if not exists session_id text;
alter table public.discount_codes add column if not exists list_price numeric(10,2);
alter table public.discount_codes add column if not exists payable numeric(10,2);
alter table public.discount_codes add column if not exists reserved_at timestamptz;
alter table public.discount_codes add column if not exists used_at timestamptz;
alter table public.discount_codes add column if not exists deactivated_at timestamptz;
alter table public.discount_codes add column if not exists created_at timestamptz not null default now();

do $guard$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'discount_codes_status_check'
      and conrelid = 'public.discount_codes'::regclass
  ) then
    alter table public.discount_codes
      add constraint discount_codes_status_check
      check (status in ('unused', 'reserved', 'used', 'deactivated'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'discount_codes_amount_check'
      and conrelid = 'public.discount_codes'::regclass
  ) then
    alter table public.discount_codes
      add constraint discount_codes_amount_check
      check (amount >= 0 and amount <= 1000);
  end if;
end
$guard$;

create unique index if not exists discount_codes_code_key
  on public.discount_codes (upper(btrim(code)));

create index if not exists discount_codes_registration_idx
  on public.discount_codes (registration_id);

comment on table public.discount_codes is
  'Single-use registration discounts. unused → reserved (one registration) → used when that registration is paid. See the header of this migration.';

create or replace function public.discount_money_text(p_amount numeric)
returns text
language sql
immutable
as $fn$
  select case
    when p_amount is null then '0'
    when p_amount = trunc(p_amount) then to_char(trunc(p_amount), 'FM999999990')
    else to_char(round(p_amount, 2), 'FM999999990.00')
  end;
$fn$;

create or replace function public.discount_reason_message(p_reason text)
returns text
language sql
immutable
as $fn$
  select case p_reason
    when 'used' then 'That code has already been used.'
    when 'deactivated' then 'That code is no longer active.'
    when 'not_found' then 'That code isn''t valid. Please check it and try again.'
    when 'paid' then 'This registration is already paid, so a discount code can''t be applied.'
    when 'host' then 'This registration is already free, so a discount code isn''t used.'
    when 'waitlist' then 'Discount codes can''t be used on the waitlist.'
    when 'closed' then 'This registration can''t take a discount code.'
    when 'no_price' then 'We couldn''t confirm the class price. Please refresh and try again.'
    when 'free' then 'This class is already free, so a discount code isn''t used.'
    when 'bad_registration' then 'We couldn''t apply that code to this registration. Please refresh and try again.'
    when 'not_covered' then 'There is still a balance due on this registration.'
    when 'forbidden' then 'Sign in again, then try that.'
    else 'We couldn''t apply that code. Please try again.'
  end;
$fn$;

create or replace function public.discount_fail(p_reason text)
returns jsonb
language sql
immutable
as $fn$
  select jsonb_build_object(
    'ok', false,
    'reason', p_reason,
    'message', public.discount_reason_message(p_reason)
  );
$fn$;

create or replace function public.strip_discount_promo_note(p_notes text)
returns text
language sql
immutable
as $fn$
  select nullif(btrim(regexp_replace(
    coalesce(p_notes, ''),
    '\[Promo\s+[A-Za-z0-9][A-Za-z0-9-]*\s+applied:[^\]]*\]\s*',
    '',
    'gi'
  )), '');
$fn$;

create or replace function public.discount_promo_note(
  p_code text,
  p_amount numeric,
  p_list numeric,
  p_payable numeric
)
returns text
language sql
immutable
as $fn$
  select '[Promo ' || upper(btrim(coalesce(p_code, ''))) || ' applied: ' || chr(8722) || '$'
    || public.discount_money_text(p_amount) || ' off '
    || public.discount_money_text(p_list) || ' → '
    || public.discount_money_text(p_payable) || ']';
$fn$;

-- Return a reserved code to unused. Does not write the registration row:
-- callers either update that row themselves or edit NEW in the pay-status trigger.
create or replace function public.discount_release_hold(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.discount_codes
     set status = 'unused',
         registration_id = null,
         student_name = null,
         session_id = null,
         list_price = null,
         payable = null,
         reserved_at = null
   where id = p_code_id
     and status = 'reserved';
end;
$fn$;

create or replace function public.apply_single_use_discount(
  p_code text,
  p_registration_id text,
  p_list_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code_text text := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_reg_id text := btrim(coalesce(p_registration_id, ''));
  v_reg public.registrations%rowtype;
  v_row public.discount_codes%rowtype;
  v_session_override integer;
  v_cancelled boolean;
  v_org boolean;
  v_status text;
  v_list numeric;
  v_payable numeric;
  v_notes text;
  v_updated int;
begin
  if v_reg_id = '' then
    return public.discount_fail('bad_registration');
  end if;
  if v_code_text = '' or length(v_code_text) > 40 then
    return public.discount_fail('not_found');
  end if;

  select * into v_reg
    from public.registrations
   where id = v_reg_id
   for update;
  if not found then
    return public.discount_fail('bad_registration');
  end if;

  v_status := lower(btrim(coalesce(v_reg.pay_status, '')));
  if v_status = 'paid' then
    return public.discount_fail('paid');
  elsif v_status = 'waitlist' then
    return public.discount_fail('waitlist');
  elsif v_status in ('host', 'comp', 'free', 'in_kind') then
    return public.discount_fail('host');
  elsif v_status in ('cancelled', 'canceled', 'refunded') then
    return public.discount_fail('closed');
  elsif v_status <> '' and v_status <> 'pending' and v_status <> 'unpaid' then
    return public.discount_fail('closed');
  end if;

  select s.price_override,
         coalesce(s.is_cancelled, false),
         coalesce(s.org_handles_registration, false)
    into v_session_override, v_cancelled, v_org
    from public.sessions s
   where s.id = v_reg.session_id;
  if v_cancelled or v_org then
    return public.discount_fail('closed');
  end if;

  select * into v_row
    from public.discount_codes
   where upper(btrim(code)) = v_code_text
   for update;
  if not found then
    return public.discount_fail('not_found');
  end if;
  if v_row.status = 'deactivated' then
    return public.discount_fail('deactivated');
  end if;
  if v_row.status = 'used' then
    return public.discount_fail('used');
  end if;
  if v_row.status = 'reserved'
     and v_row.registration_id is distinct from v_reg.id then
    return public.discount_fail('used');
  end if;

  if v_row.status = 'reserved' and v_row.registration_id = v_reg.id then
    if v_reg.price_paid is null and v_row.payable is not null then
      update public.registrations
         set price_paid = v_row.payable,
             discount_code = v_code_text
       where id = v_reg.id;
      v_reg.price_paid := v_row.payable;
    end if;
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'code', v_code_text,
      'amount', v_row.amount,
      'listPrice', v_row.list_price,
      'payable', coalesce(v_reg.price_paid, v_row.payable),
      'status', 'reserved',
      'notes', v_reg.notes
    );
  end if;

  if v_session_override is not null then
    v_list := v_session_override::numeric;
  elsif p_list_price is null then
    return public.discount_fail('no_price');
  else
    v_list := round(p_list_price, 2);
  end if;
  if v_list is null or v_list < 0 or v_list > 1000 then
    return public.discount_fail('no_price');
  end if;
  if v_list = 0 then
    return public.discount_fail('free');
  end if;

  v_payable := round(greatest(0, v_list - v_row.amount), 2);

  if coalesce(btrim(v_reg.discount_code), '') <> ''
     and upper(btrim(v_reg.discount_code)) <> v_code_text then
    perform public.discount_release_hold(c.id)
      from public.discount_codes c
     where c.registration_id = v_reg.id
       and c.status = 'reserved'
       and c.id <> v_row.id;
  end if;

  update public.discount_codes
     set status = 'reserved',
         registration_id = v_reg.id,
         student_name = v_reg.student_name,
         session_id = v_reg.session_id,
         list_price = v_list,
         payable = v_payable,
         reserved_at = coalesce(reserved_at, now())
   where id = v_row.id
     and status = 'unused';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return public.discount_fail('used');
  end if;

  v_notes := btrim(concat_ws(' ',
    public.strip_discount_promo_note(v_reg.notes),
    public.discount_promo_note(v_code_text, v_row.amount, v_list, v_payable)
  ));

  update public.registrations
     set price_paid = v_payable,
         discount_code = v_code_text,
         notes = v_notes
   where id = v_reg.id;

  return jsonb_build_object(
    'ok', true,
    'code', v_code_text,
    'amount', v_row.amount,
    'listPrice', v_list,
    'payable', v_payable,
    'status', 'reserved',
    'notes', v_notes
  );
end;
$fn$;

create or replace function public.release_single_use_discount(p_registration_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reg_id text := btrim(coalesce(p_registration_id, ''));
  v_reg public.registrations%rowtype;
  v_row public.discount_codes%rowtype;
begin
  if v_reg_id = '' then
    return public.discount_fail('bad_registration');
  end if;
  select * into v_reg from public.registrations where id = v_reg_id for update;
  if not found then
    return public.discount_fail('bad_registration');
  end if;
  select * into v_row
    from public.discount_codes
   where registration_id = v_reg.id
   order by case status when 'reserved' then 0 when 'used' then 1 else 2 end, reserved_at desc nulls last
   limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;
  if v_row.status = 'used' then
    return public.discount_fail('used');
  end if;
  if v_row.status <> 'reserved' then
    return jsonb_build_object('ok', true, 'released', false);
  end if;
  perform public.discount_release_hold(v_row.id);
  update public.registrations
     set price_paid = case
           when price_paid is not distinct from v_row.payable then null
           else price_paid
         end,
         discount_code = null,
         notes = public.strip_discount_promo_note(notes)
   where id = v_reg.id;
  return jsonb_build_object('ok', true, 'released', true, 'code', upper(btrim(v_row.code)));
end;
$fn$;

create or replace function public.discount_on_registration(p_registration_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.discount_codes%rowtype;
begin
  select * into v_row
    from public.discount_codes
   where registration_id = btrim(coalesce(p_registration_id, ''))
     and status in ('reserved', 'used')
   order by reserved_at desc nulls last
   limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'applied', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'code', upper(btrim(v_row.code)),
    'amount', v_row.amount,
    'listPrice', v_row.list_price,
    'payable', v_row.payable,
    'status', v_row.status
  );
end;
$fn$;

-- Family confirms a registration the discount already reduced to $0.
-- Marks the seat paid. The status trigger marks the code used. No email.
create or replace function public.settle_covered_discount(p_registration_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reg public.registrations%rowtype;
  v_row public.discount_codes%rowtype;
begin
  select * into v_reg
    from public.registrations
   where id = btrim(coalesce(p_registration_id, ''))
   for update;
  if not found then
    return public.discount_fail('bad_registration');
  end if;
  if lower(btrim(coalesce(v_reg.pay_status, ''))) = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'payable', coalesce(v_reg.price_paid, 0));
  end if;
  select * into v_row
    from public.discount_codes
   where registration_id = v_reg.id
     and status = 'reserved'
   for update;
  if not found then
    return public.discount_fail('not_found');
  end if;
  if coalesce(v_row.payable, v_reg.price_paid, 1) <> 0 then
    return public.discount_fail('not_covered');
  end if;
  update public.registrations
     set pay_status = 'paid',
         price_paid = 0,
         discount_code = upper(btrim(v_row.code))
   where id = v_reg.id;
  return jsonb_build_object('ok', true, 'payable', 0, 'code', upper(btrim(v_row.code)), 'status', 'paid');
end;
$fn$;

create or replace function public.deactivate_discount_code(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.discount_codes%rowtype;
begin
  if auth.uid() is null then
    return public.discount_fail('forbidden');
  end if;
  select * into v_row from public.discount_codes where id = p_id for update;
  if not found then
    return public.discount_fail('not_found');
  end if;
  if v_row.status = 'used' then
    return public.discount_fail('used');
  end if;
  if v_row.status = 'deactivated' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_row.status = 'reserved' then
    perform public.discount_release_hold(v_row.id);
    update public.registrations
       set price_paid = case
             when price_paid is not distinct from v_row.payable then null
             else price_paid
           end,
           discount_code = null,
           notes = public.strip_discount_promo_note(notes)
     where id = v_row.registration_id;
  end if;
  update public.discount_codes
     set status = 'deactivated',
         deactivated_at = coalesce(deactivated_at, now()),
         registration_id = null,
         reserved_at = null,
         list_price = null,
         payable = null
   where id = p_id
     and status <> 'used';
  return jsonb_build_object('ok', true, 'status', 'deactivated');
end;
$fn$;

-- Paid consumes a reserved code. Cancel / waitlist / refund before payment
-- gives a reserved code back. A used code stays used.
create or replace function public.registrations_sync_discount_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.discount_codes%rowtype;
  v_status text;
begin
  if TG_OP = 'DELETE' then
    update public.discount_codes
       set status = 'unused',
           registration_id = null,
           student_name = null,
           session_id = null,
           list_price = null,
           payable = null,
           reserved_at = null
     where registration_id = OLD.id
       and status = 'reserved';
    return OLD;
  end if;

  v_status := lower(btrim(coalesce(NEW.pay_status, '')));
  select * into v_row
    from public.discount_codes
   where registration_id = NEW.id
     and status = 'reserved'
   for update;
  if not found then
    return NEW;
  end if;

  if v_status = 'paid' then
    update public.discount_codes
       set status = 'used',
           used_at = coalesce(used_at, now()),
           student_name = coalesce(student_name, NEW.student_name)
     where id = v_row.id
       and status = 'reserved';
    return NEW;
  end if;

  if v_status in ('cancelled', 'canceled', 'refunded', 'waitlist', 'host', 'in_kind', 'comp', 'free') then
    update public.discount_codes
       set status = 'unused',
           registration_id = null,
           student_name = null,
           session_id = null,
           list_price = null,
           payable = null,
           reserved_at = null
     where id = v_row.id
       and status = 'reserved';
    if NEW.price_paid is not distinct from v_row.payable then
      NEW.price_paid := null;
    end if;
    if upper(btrim(coalesce(NEW.discount_code, ''))) = upper(btrim(v_row.code)) then
      NEW.discount_code := null;
    end if;
    NEW.notes := public.strip_discount_promo_note(NEW.notes);
    return NEW;
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists registrations_discount_code_status on public.registrations;
create trigger registrations_discount_code_status
  before update of pay_status on public.registrations
  for each row
  execute function public.registrations_sync_discount_code();

drop trigger if exists registrations_discount_code_delete on public.registrations;
create trigger registrations_discount_code_delete
  before delete on public.registrations
  for each row
  execute function public.registrations_sync_discount_code();

-- Same register_student as migrations/20261019_family_registration_seats.sql,
-- plus stripping discount_code so the browser cannot attach a code itself.
create or replace function public.register_student(p_row jsonb, p_max integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $register_student$
declare
  v_session_id text := nullif(btrim(coalesce(p_row->>'session_id', '')), '');
  v_student    text := nullif(btrim(coalesce(p_row->>'student_name', '')), '');
  v_requested  text := lower(btrim(coalesce(p_row->>'pay_status', '')));
  v_token      text := btrim(coalesce(p_row->>'registration_token', ''));
  v_status     text := 'pending';
  v_bypass     boolean := false;
  v_course     text;
  v_people_cap integer;
  v_per        integer;
  v_rows       integer;
  v_held       integer;
  v_occupied   integer;
  v_clean      jsonb;
  v_has_host   boolean;
  v_host_taken boolean;
  v_allow_wl   boolean;
  v_cancelled  boolean;
  v_price      integer;
  v_org_reg    boolean;
begin
  if p_row is null or v_session_id is null or coalesce(p_row->>'id', '') = '' or v_student is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_row');
  end if;

  select s.course,
         s.max_students_override,
         coalesce(s.has_host, true),
         coalesce(s.host_taken, false),
         coalesce(s.allow_waitlist, true),
         coalesce(s.is_cancelled, false),
         s.price_override,
         coalesce(s.org_handles_registration, false)
    into v_course, v_people_cap, v_has_host, v_host_taken, v_allow_wl, v_cancelled, v_price, v_org_reg
  from public.sessions s
  where s.id = v_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_cancelled then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;
  if v_org_reg then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if v_people_cap is null then
    v_people_cap := case v_course
      when 'Safe Sitter®' then 16
      when 'Safe Sitter® Babysitting Essentials' then 16
      when 'Intro to Babysitting' then 20
      when 'Safe@Home' then 16
      when 'Safe@Home — Series' then 16
      when 'Safe@Home — Virtual' then 16
      when 'Grandparents: Getting Started' then 16
      when 'Care Ready' then 16
      when 'Baby Ready' then 12
      when 'Baby Ready + CPR Certification' then 12
      when 'All Kids Welcome' then 20
      when 'Stay Ready: Choking Rescue and CPR' then 12
      when 'Campus Ready: Safety Skills for College Life' then 12
      when 'Steady and Ready' then 8
      when 'My First Babysitters Club' then 12
      when 'My First Babysitters Club — Single Session' then 12
      when 'Ready. Period.' then 18
      when 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes' then 20
      when 'Social Ready' then 20
      else 8
    end;
  end if;
  v_per := case when v_course in ('Baby Ready', 'Baby Ready + CPR Certification') then 2 else 1 end;

  if v_requested = 'waitlist' then
    if not v_allow_wl then
      return jsonb_build_object('ok', false, 'reason', 'waitlist_closed');
    end if;
    v_status := 'waitlist';
    v_bypass := true;
  elsif v_requested = 'host' then
    if not v_has_host or v_host_taken then
      return jsonb_build_object('ok', false, 'reason', 'host_unavailable');
    end if;
    v_status := 'host';
    v_bypass := true;
  elsif v_requested = 'in_kind' and (
    v_token = 'AUCTION-2026'
    or coalesce(p_row->>'notes', '') like '%[AUCTION — IN-KIND DONATION:%'
  ) then
    v_status := 'in_kind';
    v_bypass := true;
  elsif v_requested = 'paid' and (
    v_token = 'REREG-2026'
    or coalesce(p_row->>'notes', '') like '%[Re-registration — already paid via PayPal]%'
  ) then
    v_status := 'paid';
    v_bypass := true;
  elsif v_requested = 'paid' and v_price = 0 then
    v_status := 'paid';
  else
    v_status := 'pending';
  end if;

  if not v_bypass then
    select count(*)::int
      into v_rows
    from public.registrations r
    where r.session_id = v_session_id
      and lower(coalesce(r.pay_status, '')) not in ('waitlist', 'cancelled', 'canceled', 'refunded');

    v_held := public.held_participants(v_session_id);
    v_occupied := greatest(v_rows * v_per, coalesce(v_held, 0));
    if (v_people_cap - v_occupied) < v_per then
      return jsonb_build_object('ok', false, 'reason', 'full', 'count', v_rows, 'max', v_people_cap);
    end if;
  end if;

  v_clean := p_row - 'pay_status' - 'paypal_tx_id' - 'price_paid' - 'registration_token' - 'discount_code';
  v_clean := jsonb_set(v_clean, '{pay_status}', to_jsonb(v_status), true);
  if coalesce(v_clean->>'created_at', '') = '' then
    v_clean := jsonb_set(
      v_clean,
      '{created_at}',
      to_jsonb(((extract(epoch from now()) * 1000)::numeric)::bigint),
      true
    );
  end if;

  begin
    insert into public.registrations
    select * from jsonb_populate_record(null::public.registrations, v_clean);
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'reason', 'exists');
  end;

  if v_status = 'host' then
    update public.sessions
       set host_taken = true
     where id = v_session_id;
  end if;

  return jsonb_build_object('ok', true, 'status', v_status, 'max', v_people_cap);
end;
$register_student$;

revoke all on function public.discount_money_text(numeric) from public, anon, authenticated;
revoke all on function public.discount_reason_message(text) from public, anon, authenticated;
revoke all on function public.discount_fail(text) from public, anon, authenticated;
revoke all on function public.strip_discount_promo_note(text) from public, anon, authenticated;
revoke all on function public.discount_promo_note(text, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.discount_release_hold(uuid) from public, anon, authenticated;
revoke all on function public.registrations_sync_discount_code() from public, anon, authenticated;

revoke all on function public.apply_single_use_discount(text, text, numeric) from public;
revoke all on function public.release_single_use_discount(text) from public;
revoke all on function public.discount_on_registration(text) from public;
revoke all on function public.settle_covered_discount(text) from public;
revoke all on function public.deactivate_discount_code(uuid) from public, anon;

grant execute on function public.apply_single_use_discount(text, text, numeric) to anon, authenticated;
grant execute on function public.release_single_use_discount(text) to anon, authenticated;
grant execute on function public.discount_on_registration(text) to anon, authenticated;
grant execute on function public.settle_covered_discount(text) to anon, authenticated;
grant execute on function public.deactivate_discount_code(uuid) to authenticated;
grant execute on function public.register_student(jsonb, integer) to anon, authenticated;

alter table public.discount_codes enable row level security;
revoke all on table public.discount_codes from anon, public;
grant select, insert, update, delete on table public.discount_codes to authenticated;

drop policy if exists "admin full access to discount_codes" on public.discount_codes;
create policy "admin full access to discount_codes"
  on public.discount_codes for all to authenticated
  using (true) with check (true);

revoke select (discount_code), insert (discount_code), update (discount_code)
  on public.registrations from anon, public;

notify pgrst, 'reload schema';
