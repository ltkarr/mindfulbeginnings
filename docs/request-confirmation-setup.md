# Class request confirmation email — one-time setup

The code is deployed. Two one-time setup steps turn on the automatic
confirmation email that requesters get when they submit the host or
organization inquiry form. Until then, the form still saves the request
and Lindsay still gets her notification — the requester just doesn't get
the automatic email yet.

## Step 1 — Create the EmailJS template (5 minutes)

1. Go to emailjs.com → **Email Templates → Create New Template**.
2. Name it `Class request confirmation`.
3. Set the **To** field to `{{to_email}}` and pick your connected email
   service (the same one the other templates use).
4. Subject: `We got your Mindful Beginnings class request`
5. Body — copy/paste; these are the available variables:

```
Hi {{submitter_name}},

Thanks for reaching out! We've received your request for {{course}}.

Our team will be in touch soon with next steps for scheduling, plus
information you can share with your participants.

— The Mindful Beginnings Team
```

## Step 2 — Add the env var and redeploy (3 minutes)

1. In Vercel: project **Settings → Environment Variables**.
2. Add `EMAILJS_TEMPLATE_REQUEST_CONFIRM` with the new template's ID.
3. **Redeploy** (Deployments tab → … → Redeploy) so the function picks it up.
