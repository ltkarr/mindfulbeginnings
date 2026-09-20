# Automatic day-before instructor reminders — one-time setup

The code is deployed. Three one-time setup steps turn it on. After that, every
morning at 8am ET the site emails each instructor teaching **tomorrow** a class
reminder automatically. A session is never emailed twice in one day.

## Step 1 — Run the database migration (2 minutes)

In Supabase: **SQL editor → New query**, paste the contents of
`migrations/portal_reminders.sql`, and run it. (Same file also creates the
`portal_announcements` table setup if you haven't run `migrations/portal_announcements.sql` yet —
run that one too; it powers the announcement cards on the portal home screen.)

## Step 2 — Create the EmailJS template (5 minutes)

1. Go to emailjs.com → **Email Templates → Create New Template**.
2. Name it `Instructor class reminder`.
3. Set the **To** field to `{{instructor_email}}` and pick your connected email
   service (the same one the other templates use).
4. Subject: `Reminder: your {{course}} class is tomorrow ({{class_date}})`
5. Body — copy/paste and adjust freely; these are the available variables:

```
Hi {{instructor_name}},

Just a reminder that you are scheduled to teach {{course}} TOMORROW, {{class_date}}.

Time: {{class_time}}
Location: {{location_text}}
Students registered: {{student_count}}

Please make sure your materials are packed and ready to go. If anything has
come up, call or text Lindsay at 703-987-5979.

Thank you so much! We really appreciate you.
```

6. Save, then copy the **Template ID**.

## Step 3 — Add two values in Vercel (3 minutes)

Vercel dashboard → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `EMAILJS_TEMPLATE_REMINDER` | the Template ID from Step 2 |
| `EMAILJS_PRIVATE_KEY` | EmailJS dashboard → Account → General → Private Key |
| `CRON_SECRET` | any long random string (e.g. from a password generator) |

Then **Deployments → Redeploy** the latest deployment so the new variables take
effect.

## How to check it's working

- The next morning after setup, visit
  `https://register.mindfulbeginnings.org/api/remind-instructors` — without the
  secret it should answer `{"error":"Unauthorized"}` (that means the guard works).
- In Vercel → **Cron Jobs** you can see each run and trigger one manually.
- If an instructor says they didn't get one, check Supabase `reminder_log` —
  every sent reminder is recorded with its session and timestamp.

## Notes

- Sessions that are cancelled, on hold, or have no assigned instructor are skipped.
- Instructors without an email on file are skipped.
- Your manual dashboard reminders (the "Send" buttons on the 1-day-out checklist)
  keep working exactly as before — this is in addition to them, not a replacement.
