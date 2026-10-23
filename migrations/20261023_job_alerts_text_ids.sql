-- ============================================================================
--  Mindful Beginnings — instructor job-alert subscriptions
--
--  Replaces migrations/20261021_job_alerts.sql, which was never applied.
--  That file declared instructor_id / session_id as uuid. Live ids are text,
--  so those foreign keys would fail. This version uses text.
--
--  WHAT THIS DOES:
--    1. instructors.job_alerts_enabled (boolean, default false). Opt-in only.
--    2. instructors.job_alerts_last_digest_at (timestamptz, default now()).
--       Jobs created before this marker are never emailed. Adding the column
--       stamps every current instructor, so the first digest cannot backfill
--       jobs that already exist. Stamp it again immediately before the
--       EmailJS template env var is turned on.
--    3. job_alert_notifications — (instructor, session) pairs already emailed.
--    4. job_alert_digests — one row per instructor per Eastern calendar day,
--       so a retried cron cannot send a second digest the same day.
--    5. instructor_update_self accepts job_alerts_enabled. Credential columns
--       stay admin-only.
--
--  ACCESS: watermark tables are service-role only. RLS on, no policies,
--  anon/authenticated revoked.
--
--  This does not send email and does not schedule anything.
--  SAFE TO RE-RUN: yes.
-- ============================================================================

alter table public.instructors
  add column if not exists job_alerts_enabled boolean not null default false;

alter table public.instructors
  add column if not exists job_alerts_last_digest_at timestamptz not null default now();

comment on column public.instructors.job_alerts_enabled is
  'Instructor opted in to a daily email when new jobs they can teach are posted. Default false. Toggled from the instructor portal Home screen and My account.';

comment on column public.instructors.job_alerts_last_digest_at is
  'Cursor for new-job digests. Only sessions.created_at after this instant are eligible. Stamped for every instructor before alerts are enabled so existing jobs are not blasted.';

create table if not exists public.job_alert_notifications (
  instructor_id text not null references public.instructors(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (instructor_id, session_id)
);

comment on table public.job_alert_notifications is
  'Watermark: which instructors were emailed about which new job posts.';

create table if not exists public.job_alert_digests (
  instructor_id text not null references public.instructors(id) on delete cascade,
  digest_date date not null,
  sent_at timestamptz not null default now(),
  primary key (instructor_id, digest_date)
);

comment on table public.job_alert_digests is
  'One new-job digest per instructor per Eastern calendar day. digest_date is that ET date.';

alter table public.job_alert_notifications enable row level security;
alter table public.job_alert_digests enable row level security;

revoke all on table public.job_alert_notifications from public, anon, authenticated;
revoke all on table public.job_alert_digests from public, anon, authenticated;

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
