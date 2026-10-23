# New-job alert digest

Opt-in only. The daily instructor cron (`vercel.json`, `0 12 * * *`, which is
8:00 AM Eastern) already calls `/api/remind-instructors`. That run sends
day-before class reminders, then a new-job digest for instructors who turned
alerts on.

Nobody is emailed unless `instructors.job_alerts_enabled` is true. The column
defaults to false. The switch is on the instructor portal Home screen and
again under My account. Both save the same field through `instructor_update_self`.

Each instructor gets at most one digest per Eastern calendar day. The digest
includes only open jobs they can teach that were posted after
`job_alerts_last_digest_at`. That cursor is set to the current time for every
instructor before alerts are turned on, so the first morning does not mail a
backlog of jobs that already exist. The message tells them to turn alerts off
on the Home screen (the same switch is under My account) and links to the portal.

## Database

Apply `migrations/20261023_job_alerts_text_ids.sql`. Do not run
`migrations/20261021_job_alerts.sql` — that draft used uuid foreign keys, and
instructor and session ids are text.

Immediately before the template env var below is set, stamp the cursor again
so jobs posted while setup was in progress are not included:

```sql
update public.instructors
set job_alerts_last_digest_at = now();
```

## EmailJS template

1. EmailJS → Email Templates → Create New Template. Name it `New job alerts`.
2. To: `{{instructor_email}}`. Use the same email service as the other templates.
3. Subject: `New Mindful Beginnings jobs you can teach`
4. Body (triple braces on `jobs_html` so the job cards stay HTML):

```
Hi {{instructor_name}},

{{intro_line}}

{{{jobs_html}}}

Claim them in the instructor portal:
{{portal_url}}
```

`jobs_html` already includes the turn-off instruction and the portal link.
`{{message}}` is the same email as plain text, for a template whose body is
only `{{message}}`.

5. Copy the Template ID.

## Vercel

Set `EMAILJS_TEMPLATE_JOB_ALERTS` to that template id on the production
project, then redeploy so the cron can see it. Do not add a second cron. The
existing 8:00 AM Eastern run is the schedule.

Until the variable is set, the cron returns
`"jobAlerts":{"skipped":true,"reason":"EMAILJS_TEMPLATE_JOB_ALERTS not set"}`
and day-before reminders keep working.

A delivery test may be sent only to
`lindsay+testinstructor@mindfulbeginnings.org`
(instructor id `6677caa4-44d2-466b-a406-efdf41affba8`). The job refuses any
other locked recipient. Run `node scripts/send-job-alert-test.js` with the
three environment variables above. That script does not opt the test
instructor in. After it delivers, run the cursor stamp in this document,
then set `EMAILJS_TEMPLATE_JOB_ALERTS` and redeploy. Do not call
`/api/remind-instructors` by hand.

## Production status (2026-10-23)

`migrations/20261023_job_alerts_text_ids.sql` and
`migrations/20261023_reminder_host_address.sql` are applied on the Mindful
Beginnings database. All 27 instructors have `job_alerts_enabled = false`.
`job_alerts_last_digest_at` is set (migration default). Stamp it again
immediately before the template variable is set, so jobs posted during
setup are not included. The 8:00 AM Eastern cron already exists. Alerts
stay skipped until `EMAILJS_TEMPLATE_JOB_ALERTS` is set after the single
test send.
