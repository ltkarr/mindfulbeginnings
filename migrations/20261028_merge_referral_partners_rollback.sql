-- Reverse migrations/20261028_merge_referral_partners.sql.
-- This file does nothing unless the session has opted in:
--   select set_config('mb.rollback_referral_merge', 'yes', true);
-- Then run this file. It puts referral_partner_id values and the old PIN
-- back from the backup tables. It does not delete partner_sources rows that
-- were typed in after the merge, and it does not drop partner_sources.

do $$
begin
  if current_setting('mb.rollback_referral_merge', true) is distinct from 'yes' then
    raise exception 'Refusing to roll back. Set mb.rollback_referral_merge to yes for this session, then run this file again.';
  end if;
  if to_regclass('public.referral_program_backup_partners') is null then
    raise exception 'Backup table referral_program_backup_partners is missing. Nothing was restored.';
  end if;
end $$;

alter table public.registrations drop constraint if exists registrations_referral_partner_id_fkey;
alter table public.sessions drop constraint if exists sessions_referral_partner_id_fkey;
alter table public.class_requests drop constraint if exists class_requests_referral_partner_id_fkey;

update public.registrations r
   set referral_partner_id = b.referral_partner_id
  from public.referral_program_backup_links b
 where b.table_name = 'registrations'
   and b.row_id = r.id;

update public.sessions s
   set referral_partner_id = b.referral_partner_id
  from public.referral_program_backup_links b
 where b.table_name = 'sessions'
   and b.row_id = s.id::text;

update public.class_requests c
   set referral_partner_id = b.referral_partner_id
  from public.referral_program_backup_links b
 where b.table_name = 'class_requests'
   and b.row_id = c.id::text;

update public.registrations r
   set referral_partner_id = null
 where r.referral_partner_id is not null
   and not exists (select 1 from public.referral_program_backup_links b where b.table_name = 'registrations' and b.row_id = r.id)
   and not exists (select 1 from public.referral_partners p where p.id = r.referral_partner_id);

update public.sessions s
   set referral_partner_id = null
 where s.referral_partner_id is not null
   and not exists (select 1 from public.referral_program_backup_links b where b.table_name = 'sessions' and b.row_id = s.id::text)
   and not exists (select 1 from public.referral_partners p where p.id = s.referral_partner_id);

update public.class_requests c
   set referral_partner_id = null
 where c.referral_partner_id is not null
   and not exists (select 1 from public.referral_program_backup_links b where b.table_name = 'class_requests' and b.row_id = c.id::text)
   and not exists (select 1 from public.referral_partners p where p.id = c.referral_partner_id);

alter table public.registrations
  add constraint registrations_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.referral_partners(id);

alter table public.sessions
  add constraint sessions_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.referral_partners(id);

alter table public.class_requests
  add constraint class_requests_referral_partner_id_fkey
  foreign key (referral_partner_id) references public.referral_partners(id);

update public.referral_partners p
   set pin = b.pin
  from public.referral_program_backup_partners b
 where b.id = p.id;

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

revoke all on function public.referral_partner_for_text(text) from public, anon;
grant execute on function public.referral_partner_for_text(text) to authenticated;

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

notify pgrst, 'reload schema';
