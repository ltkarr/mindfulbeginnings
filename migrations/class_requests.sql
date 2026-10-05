-- ============================================================================
--  Mindful Beginnings — class request intake
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    1. Creates public.class_requests. One row is a private-host or
--       organization form submission, the checklist Lindsay works in ADMIN,
--       and the confirmation draft (subject, body, and an Outlook draft id
--       when Microsoft Graph is configured).
--    2. Enables row level security. The public anon key cannot read or write
--       this table. Families submit through the server, which uses the
--       service role. The admin login (authenticated) can read and update
--       the checklist.
--    3. Does not send email. Confirmation mail stays a draft until Lindsay
--       sends it herself.
--
--  SAFE TO RE-RUN: yes. The table, grants, and policy are idempotent.
-- ============================================================================

create table if not exists public.class_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('host', 'organization')),
  status text not null default 'received' check (
    status in (
      'received',
      'session_created',
      'draft_ready',
      'email_sent',
      'instructor_open',
      'instructor_claimed',
      'done',
      'archived'
    )
  ),
  checklist jsonb not null default jsonb_build_object(
    'received', true,
    'session_created', false,
    'draft_ready', false,
    'email_sent', false,
    'instructor_claimed', false,
    'done', false,
    'archived', false
  ),
  payload jsonb not null default '{}'::jsonb,
  submitter_name text,
  submitter_email text,
  submitter_phone text,
  organization_name text,
  course text,
  course_key text,
  session_id text,
  session_code text,
  session_error text,
  draft_subject text,
  draft_body text,
  draft_to text,
  outlook_draft_id text,
  outlook_web_link text,
  outlook_error text,
  notify_error text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.class_requests is
  'Private host and organization class requests. Admin checklist plus the unsent confirmation draft. Anon has no access.';

create index if not exists class_requests_created_at_idx
  on public.class_requests (created_at desc);

create index if not exists class_requests_status_idx
  on public.class_requests (status);

alter table public.class_requests enable row level security;

revoke all on table public.class_requests from public, anon;

grant select, insert, update, delete on table public.class_requests to authenticated;
grant select, insert, update, delete on table public.class_requests to service_role;

drop policy if exists "admin full access to class_requests" on public.class_requests;
create policy "admin full access to class_requests"
  on public.class_requests
  for all
  to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';
