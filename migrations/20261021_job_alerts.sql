-- ============================================================================
--  Mindful Beginnings — instructor job-alert subscriptions
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Adds instructors.job_alerts_enabled (boolean, default false). Instructors
--       opt in from the portal (My Profile → "Email me about new jobs"); the flag
--       rides along in the instructor profile automatically because
--       instructor_list_sessions returns the whole instructor row (minus PIN).
--    2. Creates public.job_alert_notifications, a watermark of (instructor,
--       session) pairs already emailed, so the alert job never double-sends —
--       even if a run is retried or two runs overlap.
--    3. Allows instructors to toggle their own job_alerts_enabled through the
--       existing instructor_update_self RPC (self-service safe, like the
--       Safe Sitter training date). Credential columns stay admin-only.
--
--  ACCESS: watermark table is service-role only (the alert job). No anon/
--    authenticated access; neither the portal nor the admin UI reads it.
--
--  SAFE TO RE-RUN: yes.
-- ============================================================================

alter table public.instructors
  add column if not exists job_alerts_enabled boolean default false;

comment on column public.instructors.job_alerts_enabled is
  'Instructor opted in to email alerts for newly posted jobs they are eligible to teach. Toggled by the instructor in the portal (My Profile).';

create table if not exists public.job_alert_notifications (
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (instructor_id, session_id)
);

comment on table public.job_alert_notifications is
  'Watermark: which instructors were emailed about which new job posts. Prevents duplicate job-alert emails across retries or overlapping runs.';

alter table public.job_alert_notifications enable row level security;

revoke all on table public.job_alert_notifications from public, anon;

-- Let instructors toggle their own alert preference through the existing
-- self-service RPC. This re-creates the function with the new column added;
-- the admin-only guards (instructor_level, Lead Teacher columns) are unchanged.
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
  if p_changes ? 'is_lead_teacher'
     or p_changes ? 'red_cross_instructor_id'
     or p_changes ? 'red_cross_cert_expires' then
    raise exception 'Lead Teacher status can only be changed by an admin'
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
    headshot_path        = coalesce(p_changes->>'headshot_path',        headshot_path),
    contract_signed      = coalesce((p_changes->>'contract_signed')::boolean,    contract_signed),
    contract_signed_date = coalesce(p_changes->>'contract_signed_date', contract_signed_date),
    contract_signature   = coalesce(p_changes->>'contract_signature',   contract_signature),
    w9_submitted         = coalesce((p_changes->>'w9_submitted')::boolean,       w9_submitted),
    headshot_completed   = coalesce((p_changes->>'headshot_completed')::boolean, headshot_completed),
    sweatshirt_size      = coalesce(p_changes->>'sweatshirt_size',      sweatshirt_size),
    job_alerts_enabled   = coalesce((p_changes->>'job_alerts_enabled')::boolean, job_alerts_enabled)
  where id = v_id;

  return true;
end;
$$;

grant execute on function public.instructor_update_self(text, jsonb) to anon;
