-- ============================================================================
--  Mindful Beginnings — portal announcements table
--  Run in the Supabase SQL editor (Project → SQL editor → New query).
--
--  WHAT THIS DOES:
--    Creates the `portal_announcements` table that powers the announcement
--    cards on the instructor portal home screen. Lindsay manages the posts
--    from the admin Dashboard ("Portal announcements" card); instructors only
--    ever see rows where active = true.
--
--  SAFE TO RUN: yes. Creates one new table and its policies; touches nothing
--  that already exists.
-- ============================================================================

create table if not exists portal_announcements (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null,
  body       text        not null default '',
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

alter table portal_announcements enable row level security;

-- Instructors (and anyone with the anon key) can read announcements.
-- The portal itself only shows rows where active = true.
drop policy if exists "annc_public_read" on portal_announcements;
create policy "annc_public_read"
  on portal_announcements for select
  using (true);

-- Writes happen from the admin page, which uses the same anon key as the rest
-- of the app (contract signing, job acceptance, etc. all write this way).
-- Announcements carry no sensitive data.
drop policy if exists "annc_admin_write" on portal_announcements;
create policy "annc_admin_write"
  on portal_announcements for insert
  with check (true);

drop policy if exists "annc_admin_update" on portal_announcements;
create policy "annc_admin_update"
  on portal_announcements for update
  using (true)
  with check (true);

drop policy if exists "annc_admin_delete" on portal_announcements;
create policy "annc_admin_delete"
  on portal_announcements for delete
  using (true);

-- Optional starter post so the feature is visible immediately. Delete it from
-- the admin Dashboard whenever you like.
insert into portal_announcements (title, body, active)
values (
  'Welcome to your new instructor home page',
  'This is where announcements from Lindsay will appear. The portal has a fresh look and a new home screen — take a look around!',
  true
);
