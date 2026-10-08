-- Girl Scout badge courses are not RN-only by name. The session checkbox
-- (sessions.requires_rn) decides. Stay Ready, Campus Ready, Ready. Period.,
-- and Season Ready stay RN-only. A Girl Scout badge job is still never a
-- Safe Sitter® job. This does not change any session row. GSFA-270303 keeps
-- requires_rn = true from the earlier update.

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

  if v_requires_rn or v_course in (
    'Stay Ready: Choking Rescue and CPR',
    'Campus Ready: Safety Skills for College Life',
    'Ready. Period.',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'
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
