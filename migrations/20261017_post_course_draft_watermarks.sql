-- Watermarks from the old post-course Outlook draft cron
-- (api/cron/post-course-drafts.js). That cron is turned off: vercel.json
-- does not schedule it, and the handler returns without creating Graph
-- drafts. Rows already stored here stay put. Drafts were never sent
-- automatically.

create table if not exists post_course_draft_watermarks (
  session_id text primary key,
  drafted_at timestamptz not null default now(),
  draft_id text,
  recipient_count integer not null default 0
);

-- Service role (used by the cron) bypasses RLS, but grant explicitly anyway.
grant select, insert, update on post_course_draft_watermarks to service_role;
