-- Watermarks for the automated post-course Outlook draft cron
-- (api/cron/post-course-drafts.js). One row per session means a draft was
-- created in Lindsay's Outlook drafts folder, so each class gets drafted
-- exactly once. Drafts are NEVER sent automatically.

create table if not exists post_course_draft_watermarks (
  session_id text primary key,
  drafted_at timestamptz not null default now(),
  draft_id text,
  recipient_count integer not null default 0
);

-- Service role (used by the cron) bypasses RLS, but grant explicitly anyway.
grant select, insert, update on post_course_draft_watermarks to service_role;
