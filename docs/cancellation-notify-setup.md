# Automatic instructor email on session cancellation — one-time setup

The code is deployed. When Lindsay cancels a session in the admin, the
instructor now gets an email automatically through EmailJS — no popup, no
manual send. The family notice still opens in the composer as before. If the
automatic send fails for any reason, the instructor pane opens too, so nothing
is ever lost.

Two one-time setup steps turn it on.

## Step 1 — Create the EmailJS template (5 minutes)

1. Go to emailjs.com → **Email Templates → Create New Template**.
2. Name it `Instructor cancellation notice`.
3. Set the **To** field to `{{instructor_email}}` and pick your connected email
   service (the same one the class-reminder template uses).
4. Subject: `Cancelled: your {{course}} class on {{class_date}}`
5. Body — copy/paste and adjust freely; these are the available variables:

```
Hi {{instructor_name}},

I'm writing to let you know that your {{course}} class on {{class_date}} has been cancelled ({{cancel_reason}}).

Time: {{class_time}}
Location: {{location_text}}

You do not need to attend. Please take the date off your calendar, and thank you so much for your flexibility.

— Lindsay
Mindful Beginnings
703-987-5979
```

6. Save, then copy the **Template ID**.

## Step 2 — Add one value in Vercel (2 minutes)

Vercel dashboard → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `EMAILJS_TEMPLATE_CANCELLATION` | the Template ID from Step 1 |

`EMAILJS_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are already set (the
day-before reminders use them).

Optional: `ADMIN_EMAILS` — comma-separated list of admin emails allowed to
trigger the send. Defaults to `lindsay@mindfulbeginnings.org`.

## How it works

- `admin.html` → `cancelSession()` → after the session saves as cancelled, it
  POSTs `{session_id}` to `/api/notify-instructor-cancelled` with Lindsay's
  Supabase session token.
- `api/notify-instructor-cancelled.js` verifies the token belongs to an admin,
  loads the session (and refuses unless it is actually cancelled), then emails
  every assigned instructor with an address on file.
- The route never sends for a session that is not cancelled, and only admin
  emails can trigger it.
