-- Girl Scout Badge Class is not a Safe Sitter® class, and GSFA-270303 stays
-- on that private code. Recurring expenses are one row that counts in each
-- period until they are stopped.

alter table public.expenses
  add column if not exists recurrence text,
  add column if not exists recur_until date,
  add column if not exists recur_active boolean default true;

comment on column public.expenses.recurrence is
  'weekly, monthly, or yearly. Null is a one-time charge.';
comment on column public.expenses.recur_until is
  'Last day a repeating expense still counts. Null keeps going.';
comment on column public.expenses.recur_active is
  'False stops future periods. Charges on or before recur_until stay.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_recurrence_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_recurrence_check
      check (recurrence is null or recurrence in ('weekly', 'monthly', 'yearly'));
  end if;
end $$;

-- Column privileges are explicit on this table. A new column the admin
-- cannot select breaks the whole expenses load.
grant select, insert, update (recurrence, recur_until, recur_active)
  on table public.expenses to authenticated, service_role;

-- Accepting a job: Girl Scout badge workshops are RN-only and are never
-- treated as Safe Sitter®, even if an old flag said otherwise.
create or replace function public.instructor_accept_job(p_pin text, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_active boolean;
  v_onboarded boolean;
  v_ss boolean;
  v_rn boolean;
  v_current text;
  v_course text;
  v_requires_rn boolean;
  v_requires_ss boolean;
  v_cancelled boolean;
  v_hold boolean;
  v_owner boolean;
  v_girl_scout boolean;
begin
  select i.id,
         coalesce(i.is_active, true),
         (
           coalesce(i.contract_signed, false)
           and coalesce(i.w9_submitted, false)
           and coalesce(btrim(i.cpr_cert_path), '') <> ''
           and coalesce(btrim(i.license_path), '') <> ''
           and coalesce(i.headshot_completed, false)
           and (
             coalesce(btrim(i.safe_sitter_training_date), '') <> ''
             or i.safe_sitter_certified = false
           )
         ),
         coalesce(i.safe_sitter_certified, false),
         coalesce(i.is_rn, false)
    into v_id, v_active, v_onboarded, v_ss, v_rn
  from public.instructors i
  where i.pin = p_pin
  limit 1;

  if v_id is null or not v_active or not v_onboarded then
    return false;
  end if;

  select s.course,
         coalesce(s.requires_rn, false),
         coalesce(s.requires_safe_sitter, false),
         coalesce(s.is_cancelled, false),
         coalesce(s.is_hold, false),
         coalesce(s.owner_taught, false)
    into v_course, v_requires_rn, v_requires_ss, v_cancelled, v_hold, v_owner
  from public.sessions s
  where s.id = p_session_id;

  if not found or v_cancelled or v_hold or v_owner then
    return false;
  end if;

  v_girl_scout := v_course ~* 'girl scouts?' and v_course ~* 'badge';

  if v_requires_rn or v_girl_scout or v_course in (
    'Stay Ready: Choking Rescue and CPR',
    'Campus Ready: Safety Skills for College Life',
    'Ready. Period.',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes',
    'Girl Scouts — First Aid Badge Workshop',
    'Girl Scout Badge Class'
  ) then
    if not v_rn then
      return false;
    end if;
  end if;

  if not v_girl_scout and (
    v_requires_ss or v_course in (
      'Safe Sitter®',
      'Grandparents: Getting Started'
    )
  ) then
    if not v_ss then
      return false;
    end if;
  end if;

  select j.instructor_id into v_current
  from public.job_data j
  where j.session_id = p_session_id;
  if v_current is not null and v_current <> v_id then
    return false;
  end if;

  insert into public.job_data (session_id, instructor_id, waitlist)
  values (p_session_id, v_id, '[]'::jsonb)
  on conflict (session_id) do update
    set instructor_id = excluded.instructor_id,
        waitlist = coalesce((
          select jsonb_agg(elem)
          from jsonb_array_elements_text(public.job_data.waitlist) elem
          where elem <> excluded.instructor_id
        ), '[]'::jsonb);

  update public.sessions
     set instructor_id = v_id
   where id = p_session_id;

  return true;
end;
$$;

grant execute on function public.instructor_accept_job(text, text) to anon, authenticated;

-- This one private session keeps its code. The course type is Girl Scout
-- Badge Class, RN-only, and not Safe Sitter®. Date, time, location, notes,
-- and pay are unchanged.
update public.sessions
   set course = 'Girl Scout Badge Class',
       requires_rn = true,
       requires_safe_sitter = false,
       instructor_info = 'No instructor preference from the troop beyond RN: someone good with littles (Brownies, grades 2–3). RN instructors only.'
 where code = 'GSFA-270303';
