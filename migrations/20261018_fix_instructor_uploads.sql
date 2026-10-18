-- ============================================================================
--  Mindful Beginnings — instructor document uploads
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  DO NOT apply this from the app, a cron, or a deploy script. Lindsay
--  reviews and runs it.
--
--  WHAT THIS FIXES:
--    1. Since the Oct 6 lockdown, anon storage policies that did
--       `(storage.foldername(name))[1] IN (SELECT instructors.id ...)`
--       fail with "permission denied for table instructors" (42501).
--       Every instructor-portal upload hits that. The check moves into
--       is_instructor_folder(), which is security definer, so it can read
--       instructors without granting the table to anon.
--    2. migrations/20261017_spanish_flags.sql taught instructor_update_self
--       to write headshot_path. That column was never created, so every
--       profile save that touches the function fails with 42703. This adds
--       headshot_path, plus w9_path and w9_received_date for the admin
--       paperwork screen.
--
--  instructors.id is uuid (see instructor_id uuid references
--  public.instructors(id) in migrations/20261017_instructor_eval_watermarks.sql).
--  storage.foldername() returns text, and uuid = text is not an operator,
--  so the lookup compares id::text. A non-uuid folder name simply does not
--  match.
--
--  Policy names dropped below are the live "anon … instructor-docs" policies
--  plus the names created in migrations/20261017_spanish_flags.sql
--  ("Instructors can upload/read/replace docs"). "admin full access to
--  instructor-docs" (authenticated, ALL) is left in place.
--
--  Anon can upload a W-9 but cannot read or replace w9.* files. Admin
--  signed links still work through the authenticated policy. The admin
--  page never renders the form or a TIN.
--
--  SAFE TO RE-RUN: yes. Columns, function, and policies are idempotent.
-- ============================================================================

alter table public.instructors add column if not exists headshot_path text;
alter table public.instructors add column if not exists w9_path text;
alter table public.instructors add column if not exists w9_received_date date;

create or replace function public.is_instructor_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instructors
    where id::text = (storage.foldername(p_name))[1]
  );
$$;

grant execute on function public.is_instructor_folder(text) to anon, authenticated;

drop policy if exists "anon upload to instructor-docs" on storage.objects;
drop policy if exists "anon update on instructor-docs" on storage.objects;
drop policy if exists "anon read instructor-docs"      on storage.objects;
drop policy if exists "Instructors can upload docs"    on storage.objects;
drop policy if exists "Instructors can replace docs"   on storage.objects;
drop policy if exists "Instructors can read docs"      on storage.objects;

create policy "portal insert instructor-docs" on storage.objects for insert to anon
  with check (bucket_id = 'instructor-docs' and public.is_instructor_folder(name));

create policy "portal update instructor-docs" on storage.objects for update to anon
  using (bucket_id = 'instructor-docs' and public.is_instructor_folder(name) and storage.filename(name) not like 'w9.%')
  with check (bucket_id = 'instructor-docs' and public.is_instructor_folder(name) and storage.filename(name) not like 'w9.%');

create policy "portal read instructor-docs" on storage.objects for select to anon
  using (bucket_id = 'instructor-docs' and public.is_instructor_folder(name) and storage.filename(name) not like 'w9.%');
