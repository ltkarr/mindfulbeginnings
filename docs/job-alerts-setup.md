# New-job alert digest — one-time setup

The code is deployed. Three one-time setup steps turn it on. After that, every
morning at 8am ET (same run as the day-before reminders) the site emails each
instructor who **subscribed** about new jobs posted in the last 48 hours that
they are personally eligible to teach.

**Opt-in only.** Instructors subscribe themselves in the portal under
My Profile → "Email me when new jobs are posted." The toggle is off by
default — nobody gets alerts automatically. Instructors only ever hear about
jobs matching their credentials (RN, Safe Sitter®, Spanish, Lead Teacher),
using the exact same rules as their Open jobs board. One email per instructor
per day at most, and only on days with something new. A job that gets claimed
or cancelled before the morning run is never emailed.

## Step 1 — Run the database migration (2 minutes)

In Supabase: **SQL editor → New query**, paste the contents of
`migrations/20261021_job_alerts.sql`, and run it. This adds the
`job_alerts_enabled` opt-in column, the `job_alert_notifications` watermark
table (prevents double-sends), and lets instructors toggle their own
preference through the existing self-service update function.

## Step 2 — Create the EmailJS template (5 minutes)

1. Go to emailjs.com → **Email Templates → Create New Template**.
2. Name it `New job alerts`.
3. Set the **To** field to `{{instructor_email}}` and pick your connected email
   service (the same one the other templates use).
4. Subject: `New Mindful Beginnings jobs you can teach`
5. Body — copy/paste; these are the available variables:

```
Hi {{instructor_name}},

{{intro_line}}

{{{jobs_html}}}

Claim them in the instructor portal:
{{portal_url}}

You're getting this because you turned on new-job alerts in your portal
profile. Turn them off anytime under My Profile.
```

Note the triple braces around `{{{jobs_html}}}` — the job list is pre-formatted
HTML and must not be escaped. (`{{intro_line}}` reads e.g. "3 new jobs were
posted that you're eligible to teach:".)

6. Save, then copy the **Template ID**.

## Step 3 — Add one value in Vercel (2 minutes)

Vercel dashboard → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `EMAILJS_TEMPLATE_JOB_ALERTS` | the Template ID from Step 2 |

Then **Deployments → Redeploy** the latest deployment so the new variable takes
effect. (`EMAILJS_PRIVATE_KEY` is already set from the reminder setup.)

## How to check it's working

- The morning after setup, an instructor who subscribed will get the digest
  only if a matching job was posted in the previous 48 hours. Quiet days send
  nothing.
- To see what the last run did, visit the cron URL with the secret — it now
  returns a `jobAlerts` section alongside the reminders:
  `https://instructorportal.mindfulbeginnings.org/api/remind-instructors`
  (without the secret it answers `{"error":"Unauthorized"}` — that means the
  guard works).
- Until Step 2–3 are done, the cron logs
  `"jobAlerts":{"skipped":true,"reason":"EMAILJS_TEMPLATE_JOB_ALERTS not set"}`
  and the day-before reminders keep working normally.

## If an instructor says they subscribed but gets nothing

1. They only get jobs they are eligible to teach — check their credentials
   (RN / Safe Sitter® / Spanish / Lead Teacher flags on the Instructors tab).
2. Jobs posted more than 48 hours ago, already claimed, on hold, or cancelled
   are never emailed.
3. They can toggle the preference off and back on in the portal; the next
   morning's run picks up anything still in the 48-hour window.
