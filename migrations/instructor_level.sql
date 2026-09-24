-- ============================================================================
--  Mindful Beginnings — instructor level
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds instructors.instructor_level with exactly four values, in order:
--         Started, Established, Senior, Lead.
--       Existing rows default to Started. Nothing else on the roster
--       (RN, Safe Sitter®, contract type, classes taught) is a level, so
--       there is no better column to copy from.
--    2. Lets an instructor SEE their level (instructor_login returns it, and
--       instructor_get_level is the same kind of PIN helper the portal
--       already uses for is_rn / is_active).
--    3. Lets only an admin change it.
--
--  WHO COUNTS AS ADMIN
--    The admin portal signs in with Supabase Auth, so its requests run as
--    the `authenticated` role (see the existing "admin full access to
--    instructors" policy). The instructor portal never signs in that way.
--    It uses the public anon key plus a PIN, and writes its own profile
--    through instructor_update_self.
--
--  HOW THE LOCK IS ENFORCED (not just hidden in the page):
--    * Column privileges. anon currently has table-level INSERT and UPDATE
--      on instructors, and a table-level grant covers every new column.
--      Revoking that table grant and granting the old columns back means
--      a direct write from the anon key cannot include instructor_level.
--      authenticated (the admin) keeps its table-level grant, so the admin
--      portal can still upsert the column. SELECT is unchanged, so existing
--      select * queries keep working.
--    * Trigger. guard_instructor_level rejects any insert/update that would
--      set a level other than the default unless the request JWT role is
--      authenticated or service_role. A SQL-editor session (no JWT, role
--      postgres) is still allowed. This also covers security-definer RPCs:
--      instructor_update_self runs as postgres, but the caller's JWT role
--      is still anon, so the trigger refuses a level change from it.
--    * instructor_update_self. The profile-update RPC has an explicit
--      allow-list and now raises if p_changes contains instructor_level,
--      instead of writing that key.
--
--  SAFE TO RE-RUN: yes. Column, constraint, functions, trigger, and grants
--  are written so a second run sets the same state again.
-- ============================================================================

alter table public.instructors
  add column if not exists instructor_level text not null default 'Started';

update public.instructors
   set instructor_level = 'Started'
 where instructor_level is null;

alter table public.instructors
  drop constraint if exists instructors_instructor_level_check;

alter table public.instructors
  add constraint instructors_instructor_level_check
  check (instructor_level in ('Started', 'Established', 'Senior', 'Lead'));

comment on column public.instructors.instructor_level is
  'Instructor level: Started, Established, Senior, or Lead. Only the admin (authenticated) may change it.';

-- ----------------------------------------------------------------------------
--  anon may still insert/update every pre-existing column (the instructor
--  portal and any older anon writes keep working) but not this one.
--  Table-level UPDATE would otherwise cover the new column no matter what
--  a column-level revoke said.
-- ----------------------------------------------------------------------------
revoke insert, update on table public.instructors from anon;

grant insert, update (
  id,
  name,
  email,
  phone,
  zelle,
  pin,
  created_at,
  bio,
  safe_sitter_training_date,
  resume_path,
  cpr_cert_path,
  license_path,
  contract_signed,
  contract_signed_date,
  contract_signature,
  w9_submitted,
  hourly_rate,
  sweatshirt_size,
  headshot_completed,
  is_rn,
  contract_type,
  safe_sitter_certified,
  pin_change_required,
  is_active,
  archived_at
) on table public.instructors to anon;

revoke insert, update (instructor_level) on table public.instructors from anon;

-- ----------------------------------------------------------------------------
--  Trigger. Fires for every insert, and for an update only when the level
--  column is actually being written.
-- ----------------------------------------------------------------------------
create or replace function public.guard_instructor_level()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text;
begin
  if tg_op = 'UPDATE' and new.instructor_level is not distinct from old.instructor_level then
    return new;
  end if;
  if tg_op = 'INSERT' and new.instructor_level is not distinct from 'Started' then
    return new;
  end if;

  v_role := auth.role();
  -- Admin portal: Supabase Auth session. service_role: server key.
  if v_role in ('authenticated', 'service_role') then
    return new;
  end if;
  -- SQL editor / migrations: no request JWT, connected as the owner.
  -- Checked only when there is no JWT role, so a security-definer RPC
  -- (current_user = postgres, but auth.role() = anon) cannot sneak through.
  if v_role is null and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  raise exception 'instructor_level can only be changed by an admin'
    using errcode = '42501';
end;
$$;

drop trigger if exists instructors_guard_level on public.instructors;

create trigger instructors_guard_level
  before insert or update of instructor_level on public.instructors
  for each row
  execute function public.guard_instructor_level();

-- ----------------------------------------------------------------------------
--  Login returns the level. Same column list as the live function, plus
--  instructor_level. PIN stays omitted.
-- ----------------------------------------------------------------------------
create or replace function public.instructor_login(p_pin text)
returns json
language sql
security definer
set search_path = public
as $$
select to_json(t) from (
  select
    id, name, email, phone, zelle, bio, hourly_rate,
    safe_sitter_training_date, resume_path, cpr_cert_path, license_path,
    contract_signed, contract_signed_date, contract_signature,
    w9_submitted, headshot_completed, sweatshirt_size,
    instructor_level
  from instructors
  where pin::text = p_pin
) t;
$$;

grant execute on function public.instructor_login(text) to anon;

-- Small helper, same shape as instructor_is_rn / instructor_is_active, so the
-- portal can still read the level if a cached login function omitted it.
create or replace function public.instructor_get_level(p_pin text)
returns text
language sql
security definer
set search_path = public
as $$
  select instructor_level
  from public.instructors
  where pin::text = p_pin
  limit 1;
$$;

grant execute on function public.instructor_get_level(text) to anon;

-- ----------------------------------------------------------------------------
--  Profile-update RPC. Same allow-list as the live function. instructor_level
--  is rejected up front so a caller cannot add it by stuffing p_changes.
-- ----------------------------------------------------------------------------
create or replace function public.instructor_update_self(p_pin text, p_changes jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id instructors.id%type;
begin
  if p_changes ? 'instructor_level' then
    raise exception 'instructor_level can only be changed by an admin'
      using errcode = '42501';
  end if;

  select id into v_id from instructors where pin::text = p_pin;
  if v_id is null then
    return false;
  end if;

  update instructors set
    resume_path          = coalesce(p_changes->>'resume_path',          resume_path),
    cpr_cert_path        = coalesce(p_changes->>'cpr_cert_path',        cpr_cert_path),
    license_path         = coalesce(p_changes->>'license_path',         license_path),
    contract_signed      = coalesce((p_changes->>'contract_signed')::boolean,    contract_signed),
    contract_signed_date = coalesce(p_changes->>'contract_signed_date', contract_signed_date),
    contract_signature   = coalesce(p_changes->>'contract_signature',   contract_signature),
    w9_submitted         = coalesce((p_changes->>'w9_submitted')::boolean,       w9_submitted),
    headshot_completed   = coalesce((p_changes->>'headshot_completed')::boolean, headshot_completed),
    sweatshirt_size      = coalesce(p_changes->>'sweatshirt_size',      sweatshirt_size)
  where id = v_id;

  return true;
end;
$$;

grant execute on function public.instructor_update_self(text, jsonb) to anon;

notify pgrst, 'reload schema';
