# Class request intake

Home hosts and organizations submit on the registration site instead of the two Google Forms. Each submission is stored in Supabase as a **pending** class request. It does not create a session, so it does not show up in the instructor portal or in job emails. Lindsay gets a confirmation **draft**. The draft is never sent for her.

In ADMIN, open Class requests and choose **Approve and create session** on a pending request. That creates one private session and saves its id and code on the request. A second click does not create another session.

The draft written at submit time has no session code and no private registration link, because the session does not exist yet. Approving rewrites that saved draft with the session code and the private link, and creates a new Outlook draft with the complete text. Send that newer draft. The first Outlook draft stays in Drafts without a registration link.

Run `migrations/20261021_class_request_pending.sql` once in the Supabase SQL editor so `pending` is an allowed status. Until that runs, new submissions cannot be saved.

## Pages

| Who | Page |
|---|---|
| Home host | https://register.mindfulbeginnings.org/host.html |
| Organization | https://register.mindfulbeginnings.org/organization.html |
| ADMIN inbox | Class requests, in the admin sidebar |

The registration page links to both forms. The marketing site (`mindfulbeginnings.org/host-a-class-1` and `/gsnc`) is on Squarespace, so those buttons still open the old Google Forms until someone pastes the new URLs there. The old Google Forms keep working.

## One-time database step

In Supabase: **SQL editor → New query**, paste `migrations/class_requests.sql`, and run it.

`SUPABASE_SERVICE_ROLE_KEY` must be set on Vercel (it already is if PayPal auto-marks registrations paid). The public form cannot write the table with the anon key.

## Outlook drafts (optional)

Without Graph credentials, ADMIN still stores the full draft. Open it from the request, copy it, and paste it into Outlook. Nothing is emailed to the family.

To create a real draft in `lindsay@mindfulbeginnings.org`:

1. In Azure, register an app (or reuse one) with application permissions **Mail.ReadWrite** and **Mail.Send**. Grant admin consent.
2. Mail.ReadWrite creates the unsent confirmation in the Drafts folder.
3. Mail.Send is used only to notify `lindsay@mindfulbeginnings.org` that a request arrived. It is not used for the family confirmation.
4. Add these Vercel environment variables, then redeploy:

| Name | Value |
|---|---|
| `MS_GRAPH_TENANT_ID` | Directory (tenant) ID |
| `MS_GRAPH_CLIENT_ID` | Application (client) ID |
| `MS_GRAPH_CLIENT_SECRET` | Client secret |
| `MS_GRAPH_MAILBOX` | `lindsay@mindfulbeginnings.org` |

There is no setting that auto-sends the confirmation. Adding one later would have to be explicit.

If Graph is not available, an EmailJS template can notify Lindsay only. Set `EMAILJS_TEMPLATE_CLASS_REQUEST` (To: `{{to_email}}`, body: `{{message}}`, subject: `{{subject}}`) and `EMAILJS_PRIVATE_KEY`. That template must not be pointed at the family.

## Checklist

Pending (no session yet) → Approve and create session → confirmation drafted → email sent (you mark this) → done.
