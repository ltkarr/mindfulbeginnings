-- Auto-match incoming Venmo, Zelle, and PayPal payments to pending registrations.
-- NOT APPLIED. Review, then run in the Supabase SQL editor after the PR is approved.
--
-- This script does not update sessions. It does not write sessions.price_override.
-- It does not write registrations.price_paid. A valid payment amount is the amount
-- that registration already owes (stored price, promo payable, session price
-- override, or the catalog list price for when that session was created).
--
-- Matching:
--   1. Memo contains id_xxxx of a pending registration and the amount owed matches
--      -> mark paid.
--   2. Memo contains an id that is pending but the amount does not match
--      -> stay pending, review note on that row only.
--   3. Memo contains an id that exists but is not pending
--      -> do not mark a different registration paid.
--   4. Otherwise the payer name, email, or phone matches exactly one pending
--      registration created in the 21 days before the payment, and the amount
--      owed matches -> mark paid.
--   5. Two or more matches, or a name match with a different amount
--      -> stay pending, review note on each candidate.
--
-- Paid rows get the same fields as admin Mark paid, plus an auto-matched note.
-- Each Gmail message id is inserted once.
--
-- After this runs, set the secret (at least 20 characters) and install the Apps Script.
-- See docs/PAYMENT-AUTO-MATCH.md.
--   insert into private.settings (key, value)
--   values ('payment_ingest_secret', 'paste-a-long-random-string')
--   on conflict (key) do update set value = excluded.value;

create schema if not exists private;
revoke all on schema private from public;
do $guard$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
  end if;
end
$guard$;

create table if not exists private.settings (
  key text primary key,
  value text not null
);
alter table private.settings enable row level security;
revoke all on table private.settings from public;
do $guard$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table private.settings from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table private.settings from authenticated';
  end if;
end
$guard$;

create table if not exists public.payment_notifications (
  id bigserial primary key,
  message_id text unique not null,
  source text not null check (source in ('venmo', 'zelle', 'paypal')),
  payer_name text,
  payer_email text,
  payer_phone text,
  amount numeric(10,2) not null,
  memo text,
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'matched', 'needs_review', 'no_match')),
  registration_id text,
  candidates jsonb,
  created_at timestamptz not null default now()
);
alter table public.payment_notifications enable row level security;
revoke all on table public.payment_notifications from public;
revoke all on sequence public.payment_notifications_id_seq from public;
do $guard$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.payment_notifications from anon';
    execute 'revoke all on sequence public.payment_notifications_id_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.payment_notifications from authenticated';
    execute 'revoke all on sequence public.payment_notifications_id_seq from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on table public.payment_notifications to service_role';
    execute 'grant usage, select on sequence public.payment_notifications_id_seq to service_role';
  end if;
end
$guard$;

create or replace function private.norm_name(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $fn$
  select lower(regexp_replace(btrim(coalesce(p, '')), '[[:space:]]+', ' ', 'g'));
$fn$;

create or replace function private.contact_has_email(p_contact text, p_email text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $fn$
  select p_email is not null
    and length(btrim(p_email)) > 0
    and exists (
      select 1
      from regexp_matches(
        lower(coalesce(p_contact, '')),
        '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}',
        'g'
      ) as m
      where m[1] = lower(btrim(p_email))
    );
$fn$;

create or replace function private.contact_has_phone(p_contact text, p_digits text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $fn$
  select length(coalesce(p_digits, '')) = 10
    and exists (
      select 1
      from regexp_matches(
        coalesce(p_contact, ''),
        '[0-9][0-9[:space:]().-]{8,}[0-9]',
        'g'
      ) as m
      where right(regexp_replace(m[1], '[^0-9]', '', 'g'), 10) = p_digits
    );
$fn$;

-- PRICE_CATALOG_START
-- Catalog list prices copied from config.js. Read only. Never written back to sessions.
create or replace function private.session_list_price(
  p_course text,
  p_date text,
  p_created_at numeric
) returns numeric
language plpgsql
stable
set search_path = pg_catalog
as $fn$
declare
  v_catalog jsonb := $mbprice${"newPricingEffective":"2026-08-06T21:00:00Z","customQuoteFrom":"2026-10-22T04:00:00Z","aliases":{"Grandparents: Getting Started":"Safe Sitter® Grandparents: Getting Started","Stay Ready: Choking Rescue and CPR":"Stay Ready™: Choking Rescue, CPR, and Seizure Response","Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes":"Season Ready™: Safety Skills for Student Athletes"},"later":[{"from":"2026-10-19T04:00:00Z","prices":{"My First Babysitters Club":200,"My First Babysitters Club — Single Session":165}},{"from":"2026-10-14T04:00:00Z","prices":{"Baby Ready":185,"Adult & Pediatric First Aid/CPR/AED Certification":125,"Care Ready":185}},{"from":"2026-10-09T04:00:00Z","prices":{"Social Ready":45,"Stay Ready: Choking Rescue and CPR":85,"Grandparents: Getting Started":185,"Care Ready":175,"Baby Ready":195,"Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED":295,"Adult & Pediatric First Aid/CPR/AED Certification":185}},{"from":"2026-08-27T04:00:00Z","prices":{"Safe Sitter®":225,"Safe@Home":85,"Safe@Home — Virtual":40,"Safe@Home — Series":125,"My First Babysitters Club":165,"Grandparents: Getting Started":185,"Care Ready":185,"Baby Ready":195,"All Kids Welcome":25,"Intro to Babysitting":40,"Steady and Ready":65,"Campus Ready: Safety Skills for College Life":75,"Stay Ready: Choking Rescue and CPR":75}},{"from":"2026-08-12T04:00:00Z","prices":{"Safe@Home":85,"Grandparents: Getting Started":185}}],"courses":{"Safe Sitter®":{"price":185,"price2027":225,"priceNew":225,"priceNew2027":225},"Safe Sitter® Babysitting Essentials":{"price":185,"price2027":185,"priceNew":185,"priceNew2027":185},"Intro to Babysitting":{"price":40,"price2027":50,"priceNew":40,"priceNew2027":50},"Safe@Home":{"price":65,"price2027":85,"priceNew":65,"priceNew2027":85},"Safe@Home — Series":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Safe@Home — Virtual":{"price":40,"price2027":40,"priceNew":40,"priceNew2027":40},"Safe Sitter® Grandparents: Getting Started":{"price":150,"price2027":185,"priceNew":155,"priceNew2027":185},"Care Ready":{"price":185,"price2027":185,"priceNew":185,"priceNew2027":185},"Baby Ready":{"price":195,"price2027":195,"priceNew":195,"priceNew2027":195},"Baby Ready + CPR Certification":{"price":275,"price2027":275,"priceNew":275,"priceNew2027":275},"All Kids Welcome":{"price":25,"price2027":25,"priceNew":25,"priceNew2027":25},"Stay Ready™: Choking Rescue, CPR, and Seizure Response":{"price":75,"price2027":75,"priceNew":75,"priceNew2027":75},"Campus Ready: Safety Skills for College Life":{"price":75,"price2027":75,"priceNew":75,"priceNew2027":75},"Steady and Ready":{"price":65,"price2027":65,"priceNew":65,"priceNew2027":65},"Middle School Ready":{"price":40,"price2027":40,"priceNew":40,"priceNew2027":40},"Middle School Ready — Virtual":{"price":25,"price2027":25,"priceNew":25,"priceNew2027":25},"Lunchroom Lifesaver":{"price":35,"price2027":35,"priceNew":35,"priceNew2027":35},"My First Babysitters Club":{"price":40,"price2027":50,"priceNew":165,"priceNew2027":165},"My First Babysitters Club — Single Session":{"price":95,"price2027":95,"priceNew":95,"priceNew2027":95},"Ready. Period.":{"price":75,"price2027":75,"priceNew":75,"priceNew2027":75},"Season Ready™: Safety Skills for Student Athletes":{"price":25,"price2027":25,"priceNew":25,"priceNew2027":25},"Social Ready":{"price":35,"price2027":35,"priceNew":35,"priceNew2027":35},"Girl Scouts — First Aid Badge Workshop":{"customPrice":true,"legacyPrice":45},"Girl Scout Badge Class":{"customPrice":true,"legacyPrice":45},"Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED":{"price":295,"price2027":295,"priceNew":295,"priceNew2027":295},"Adult & Pediatric First Aid/CPR/AED Certification":{"price":185,"price2027":185,"priceNew":185,"priceNew2027":185},"Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Babysitter's Training":{"price":185,"price2027":185,"priceNew":185,"priceNew2027":185},"Adult First Aid/CPR/AED Certification":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Adult First Aid/CPR/AED Certification (Hybrid)":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Basic Life Support (BLS) Certification":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Basic Life Support (BLS) Certification (Hybrid)":{"price":125,"price2027":125,"priceNew":125,"priceNew2027":125},"Group CPR Certification for Workplaces":{"customPrice":true},"Babysitting Grandkids Workshop":{"price":75,"price2027":75,"priceNew":75,"priceNew2027":75},"Babysitting Grandkids Workshop — Virtual":{"price":50,"price2027":50,"priceNew":50,"priceNew2027":50},"Little Medics":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Pet Sitter's Club":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Snack Squad":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Kid Boss Club":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Middle School, Here I Come":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Big Sibling Club":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"My First Phone":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Walk and Roll Ready":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Calm and Ready":{"price":200,"price2027":200,"priceNew":200,"priceNew2027":200},"Grandparents: Getting Started":{"price":150,"price2027":185,"priceNew":155,"priceNew2027":185},"Stay Ready: Choking Rescue and CPR":{"price":75,"price2027":75,"priceNew":75,"priceNew2027":75},"Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes":{"price":25,"price2027":25,"priceNew":25,"priceNew2027":25}}}$mbprice$;
  v_names text[] := array[coalesce(p_course, '')];
  v_alias text;
  v_old text;
  v_disp text;
  v_name text;
  v_row jsonb;
  v_change jsonb;
  v_created_ms numeric;
  v_from_ms numeric;
  v_year int;
  v_is_new boolean;
  v_custom_from_ms numeric;
  v_new_ms numeric;
  v_price text;
begin
  v_alias := v_catalog->'aliases'->>p_course;
  if v_alias is not null and not v_alias = any (v_names) then
    v_names := v_names || v_alias;
  end if;
  for v_old, v_disp in
    select key, value from jsonb_each_text(v_catalog->'aliases')
  loop
    if v_disp = p_course and not v_old = any (v_names) then
      v_names := v_names || v_old;
    end if;
  end loop;

  foreach v_name in array v_names loop
    if (v_catalog->'courses') ? v_name then
      v_row := v_catalog->'courses'->v_name;
      exit;
    end if;
  end loop;
  if v_row is null then
    return null;
  end if;

  v_created_ms := p_created_at;
  v_custom_from_ms := round((extract(epoch from (v_catalog->>'customQuoteFrom')::timestamptz) * 1000)::numeric);
  v_new_ms := round((extract(epoch from (v_catalog->>'newPricingEffective')::timestamptz) * 1000)::numeric);

  if coalesce(v_row->>'customPrice', '') = 'true'
     and v_created_ms is not null
     and v_created_ms >= v_custom_from_ms then
    return null;
  end if;

  if v_created_ms is not null then
    for v_change in
      select value from jsonb_array_elements(v_catalog->'later')
    loop
      v_from_ms := round((extract(epoch from (v_change->>'from')::timestamptz) * 1000)::numeric);
      if v_created_ms < v_from_ms then
        continue;
      end if;
      foreach v_name in array v_names loop
        v_price := v_change->'prices'->>v_name;
        if v_price is not null then
          return v_price::numeric;
        end if;
      end loop;
    end loop;
  end if;

  if coalesce(v_row->>'customPrice', '') = 'true' then
    if v_row->>'legacyPrice' is null then
      return null;
    end if;
    return (v_row->>'legacyPrice')::numeric;
  end if;

  if p_date is not null and substring(p_date from '^[0-9]{4}') is not null then
    v_year := substring(p_date from '^[0-9]{4}')::int;
  else
    v_year := extract(year from timezone('UTC', now()))::int;
  end if;

  v_is_new := v_created_ms is not null and v_created_ms >= v_new_ms;
  if v_is_new and v_year >= 2027 then
    return coalesce(v_row->>'priceNew2027', v_row->>'priceNew', v_row->>'price2027', v_row->>'price')::numeric;
  elsif v_is_new then
    return coalesce(v_row->>'priceNew', v_row->>'price')::numeric;
  elsif v_year >= 2027 then
    return coalesce(v_row->>'price2027', v_row->>'price')::numeric;
  elsif v_row->>'price' is null then
    return null;
  end if;
  return (v_row->>'price')::numeric;
end;
$fn$;
-- PRICE_CATALOG_END

create or replace function private.registration_amount_due(
  p_price_paid numeric,
  p_notes text,
  p_price_override numeric,
  p_course text,
  p_date text,
  p_created_at numeric
) returns numeric
language plpgsql
stable
set search_path = pg_catalog
as $fn$
declare
  v_promo text;
  v_list numeric;
begin
  if p_price_paid is not null then
    return round(p_price_paid, 2);
  end if;
  v_promo := substring(coalesce(p_notes, '') from '\[Promo [^]]*→[[:space:]]*([0-9]+(?:\.[0-9]{1,2})?)');
  if v_promo is null then
    v_promo := substring(coalesce(p_notes, '') from '\[Promo [^]]*->[[:space:]]*([0-9]+(?:\.[0-9]{1,2})?)');
  end if;
  if v_promo is not null then
    return round(v_promo::numeric, 2);
  end if;
  if p_price_override is not null then
    return round(p_price_override, 2);
  end if;
  v_list := private.session_list_price(p_course, p_date, p_created_at);
  if v_list is null then
    return null;
  end if;
  return round(v_list, 2);
end;
$fn$;

create or replace function public.ingest_payment_notification(
  p_secret text,
  p_message_id text,
  p_source text,
  p_payer_name text,
  p_payer_email text,
  p_payer_phone text,
  p_amount numeric,
  p_memo text,
  p_received_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_secret text;
  v_id bigint;
  v_label text;
  v_amount numeric;
  v_regid text;
  v_name text;
  v_digits text;
  v_received timestamptz;
  v_auto text;
  v_review_ids text[];
  v_block_other boolean := false;
  v_found_status text;
  v_due numeric;
  v_old_notes text;
  v_old_ref text;
  v_ref text;
  v_ref_bit text;
  v_prev text;
  v_notes text;
  v_amt_txt text;
  v_tag text;
  v_updated int;
begin
  v_secret := (select value from private.settings where key = 'payment_ingest_secret');
  if v_secret is null or length(v_secret) < 20 or p_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;
  if nullif(btrim(coalesce(p_message_id, '')), '') is null then
    raise exception 'missing message id';
  end if;
  if p_source is null or p_source not in ('venmo', 'zelle', 'paypal') then
    raise exception 'invalid source';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  insert into public.payment_notifications (
    message_id, source, payer_name, payer_email, payer_phone, amount, memo, received_at
  ) values (
    btrim(p_message_id),
    p_source,
    nullif(btrim(coalesce(p_payer_name, '')), ''),
    nullif(lower(btrim(coalesce(p_payer_email, ''))), ''),
    nullif(btrim(coalesce(p_payer_phone, '')), ''),
    round(p_amount, 2),
    nullif(btrim(coalesce(p_memo, '')), ''),
    coalesce(p_received_at, now())
  )
  on conflict (message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  v_label := case p_source
    when 'paypal' then 'PayPal'
    when 'venmo' then 'Venmo'
    when 'zelle' then 'Zelle'
    else initcap(p_source)
  end;
  v_amount := round(p_amount, 2);
  v_name := private.norm_name(p_payer_name);
  v_digits := right(regexp_replace(coalesce(p_payer_phone, ''), '[^0-9]', '', 'g'), 10);
  v_received := coalesce(p_received_at, now());
  v_regid := substring(lower(coalesce(p_memo, '')) from '(id_[a-z0-9]{4,})');

  if v_regid is not null then
    select lower(coalesce(r.pay_status, '')),
           private.registration_amount_due(
             r.price_paid, r.notes, s.price_override, s.course, s.date::text, s.created_at::numeric
           )
      into v_found_status, v_due
    from public.registrations r
    left join public.sessions s on s.id = r.session_id
    where r.id = v_regid;

    if found and v_found_status = 'pending'
       and v_due is not null and v_due = v_amount and v_amount > 0 then
      v_auto := v_regid;
    elsif found and v_found_status = 'pending' then
      v_review_ids := array[v_regid];
      v_block_other := true;
    elsif found then
      v_block_other := true;
    end if;
  end if;

  if v_auto is null and not v_block_other then
    select array_agg(sub.id order by sub.created_at desc)
      into v_review_ids
    from (
      select r.id, r.created_at
      from public.registrations r
      left join public.sessions s on s.id = r.session_id
      where lower(coalesce(r.pay_status, '')) = 'pending'
        and r.created_at is not null
        and to_timestamp(r.created_at::numeric / 1000.0) >= v_received - interval '21 days'
        and to_timestamp(r.created_at::numeric / 1000.0) <= v_received + interval '1 day'
        and private.registration_amount_due(
              r.price_paid, r.notes, s.price_override, s.course, s.date::text, s.created_at::numeric
            ) = v_amount
        and (
          (v_name <> '' and (
            private.norm_name(r.parent_name) = v_name
            or private.norm_name(r.student_name) = v_name
          ))
          or private.contact_has_email(r.contact, nullif(lower(btrim(coalesce(p_payer_email, ''))), ''))
          or private.contact_has_phone(r.contact, v_digits)
        )
    ) sub;
    if v_review_ids is not null and cardinality(v_review_ids) = 1 then
      v_auto := v_review_ids[1];
      v_review_ids := null;
    end if;
  end if;

  if v_auto is not null then
    select r.notes, r.payment_ref
      into v_old_notes, v_old_ref
    from public.registrations r
    where r.id = v_auto
      and lower(coalesce(r.pay_status, '')) = 'pending'
    for update;

    if found then
      v_ref := nullif(btrim(coalesce(p_memo, '')), '');
      if v_ref is null then
        v_ref := nullif(btrim(coalesce(v_old_ref, '')), '');
      end if;
      if v_ref is null then
        v_ref := nullif(btrim(coalesce(p_payer_name, '')), '');
      end if;
      v_amt_txt := trim(to_char(v_amount, '999990.00'));
      v_ref_bit := case when v_ref is null then '' else ' ref ' || v_ref end;
      v_prev := regexp_replace(
        coalesce(v_old_notes, ''),
        '\[Registered[[:space:]]*(—|-)[[:space:]]*awaiting payment\][[:space:]]*',
        '',
        'gi'
      );
      v_prev := regexp_replace(v_prev, '\[Family marked [^\]]*\][[:space:]]*', '', 'gi');
      v_prev := regexp_replace(v_prev, '\[Possible (Venmo|Zelle|PayPal) payment [^\]]*\][[:space:]]*', '', 'gi');
      v_prev := btrim(regexp_replace(v_prev, '[[:space:]]{2,}', ' ', 'g'));
      v_notes := btrim(
        '[Paid via ' || v_label || v_ref_bit || ' - $' || v_amt_txt || '] [Auto-matched from ' || v_label || ' email]'
        || case when v_prev = '' then '' else ' ' || v_prev end
      );
      update public.registrations
      set pay_status = 'paid',
          payment_method = p_source,
          payment_ref = v_ref,
          payment_detail = null,
          paypal_tx_id = case
            when p_source = 'paypal' and v_ref is not null then v_ref
            else paypal_tx_id
          end,
          notes = v_notes
      where id = v_auto
        and lower(coalesce(pay_status, '')) = 'pending';
      get diagnostics v_updated = row_count;
      if v_updated = 1 then
        update public.payment_notifications
        set status = 'matched', registration_id = v_auto
        where id = v_id;
        return jsonb_build_object('status', 'matched', 'registration_id', v_auto);
      end if;
    end if;
  end if;

  if v_review_ids is null and not v_block_other then
    select array_agg(sub.id order by sub.created_at desc)
      into v_review_ids
    from (
      select r.id, r.created_at
      from public.registrations r
      where lower(coalesce(r.pay_status, '')) = 'pending'
        and r.created_at is not null
        and to_timestamp(r.created_at::numeric / 1000.0) >= v_received - interval '21 days'
        and to_timestamp(r.created_at::numeric / 1000.0) <= v_received + interval '1 day'
        and (
          (v_regid is not null and r.id = v_regid)
          or (v_name <> '' and (
            private.norm_name(r.parent_name) = v_name
            or private.norm_name(r.student_name) = v_name
          ))
          or private.contact_has_email(r.contact, nullif(lower(btrim(coalesce(p_payer_email, ''))), ''))
          or private.contact_has_phone(r.contact, v_digits)
        )
    ) sub;
  end if;

  v_amt_txt := trim(to_char(v_amount, '999990.00'));
  v_tag := '[Possible ' || v_label || ' payment $' || v_amt_txt || ' from '
    || coalesce(nullif(btrim(coalesce(p_payer_name, '')), ''), '?')
    || ' on ' || to_char(v_received at time zone 'America/New_York', 'FMMon FMDD')
    || ' - review]';

  if v_review_ids is not null and cardinality(v_review_ids) > 0 then
    update public.registrations
    set notes = btrim(v_tag || ' ' || coalesce(notes, ''))
    where id = any (v_review_ids)
      and lower(coalesce(pay_status, '')) = 'pending'
      and position(v_tag in coalesce(notes, '')) = 0;
    update public.payment_notifications
    set status = 'needs_review', candidates = to_jsonb(v_review_ids)
    where id = v_id;
    return jsonb_build_object('status', 'needs_review', 'candidates', to_jsonb(v_review_ids));
  end if;

  update public.payment_notifications
  set status = 'no_match', candidates = '[]'::jsonb
  where id = v_id;
  return jsonb_build_object('status', 'no_match', 'candidates', '[]'::jsonb);
end;
$fn$;

revoke all on function private.norm_name(text) from public;
revoke all on function private.contact_has_email(text, text) from public;
revoke all on function private.contact_has_phone(text, text) from public;
revoke all on function private.session_list_price(text, text, numeric) from public;
revoke all on function private.registration_amount_due(numeric, text, numeric, text, text, numeric) from public;
revoke all on function public.ingest_payment_notification(text, text, text, text, text, text, numeric, text, timestamptz) from public;

do $guard$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function private.norm_name(text) from anon';
    execute 'revoke all on function private.contact_has_email(text, text) from anon';
    execute 'revoke all on function private.contact_has_phone(text, text) from anon';
    execute 'revoke all on function private.session_list_price(text, text, numeric) from anon';
    execute 'revoke all on function private.registration_amount_due(numeric, text, numeric, text, text, numeric) from anon';
    execute 'grant execute on function public.ingest_payment_notification(text, text, text, text, text, text, numeric, text, timestamptz) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function private.norm_name(text) from authenticated';
    execute 'revoke all on function private.contact_has_email(text, text) from authenticated';
    execute 'revoke all on function private.contact_has_phone(text, text) from authenticated';
    execute 'revoke all on function private.session_list_price(text, text, numeric) from authenticated';
    execute 'revoke all on function private.registration_amount_due(numeric, text, numeric, text, text, numeric) from authenticated';
    execute 'revoke all on function public.ingest_payment_notification(text, text, text, text, text, text, numeric, text, timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.ingest_payment_notification(text, text, text, text, text, text, numeric, text, timestamptz) to service_role';
  end if;
end
$guard$;

notify pgrst, 'reload schema';
