# Auto-match Venmo, Zelle, and PayPal payments

Venmo, Zelle, and PayPal sent outside the registration page used to stay pending until someone clicked Mark paid. Those "you received money" emails often land in Gmail Trash, so they were easy to miss.

How it works:

1. `scripts/payment-inbox-sync.gs` runs in Gmail every 10 minutes. It reads new payment emails from the whole mailbox, including Trash.
2. It calls the Supabase function `ingest_payment_notification` (see `migrations/20261026_payment_auto_match.sql`).
3. A pending registration is marked paid when either of these is true:
   - The memo contains that registration's id (the Venmo and Zelle links prefill `Reg id_...`) and the amount is what that registration owes.
   - The payer's name, email, or phone matches exactly one pending registration created in the 21 days before the payment, and the amount owed matches.
4. Anything else stays pending. When there is a likely registration, its note gets `[Possible Venmo payment $225.00 from Kristen Myers on Oct 21 - review]` (or Zelle or PayPal).
5. A paid row gets the same fields as Mark paid: `pay_status`, `payment_method`, `payment_ref`, `payment_detail`, and for PayPal `paypal_tx_id`. The note looks like `[Paid via Venmo ref Reg id_... - $225.00] [Auto-matched from Venmo email]`. `price_paid` is left as it was.
6. Each Gmail message is stored once in `payment_notifications`. A failed send is tried again on the next run.

The amount owed is, in order: `price_paid` when that registration already has one (a discount), else the payable amount written in a promo note, else that session's price override, else the catalog price for the course based on when the session was created. An older Safe Sitter price is not treated as valid for a newer session. This migration does not change session prices or any stored registration price.

No new Vercel function (the project is at the 12-function Hobby cap). The Apps Script uses the public anon key plus a shared secret checked inside the database. The secret is not in this repo.

Zelle wording differs by bank. The first real Zelle alerts should be checked in `payment_notifications` if a payment stays pending.

## Setup (Lindsay, once, after this is approved)

Do these three steps. Nothing here runs until you do.

1. In Supabase, open the SQL editor and run `migrations/20261026_payment_auto_match.sql`. That adds the matcher. It does not change class prices.
2. In that same SQL editor, save a long random secret (at least 20 characters). Use a password generator, not a word you use anywhere else:

```sql
insert into private.settings (key, value)
values ('payment_ingest_secret', 'paste-a-long-random-string')
on conflict (key) do update set value = excluded.value;
```

3. Open script.google.com, create a project, and paste `scripts/payment-inbox-sync.gs`. In Project Settings, Script properties, add `SUPABASE_URL` (`https://evninlytzhtacanrguhx.supabase.co`), `SUPABASE_ANON_KEY` (the public anon key, not the service role key), and `INGEST_SECRET` (the same string as step 2). Run `install` and approve access. It then checks Gmail, including Trash, every 10 minutes.

If `payment_method` is missing on registrations, run `migrations/payment_method.sql` first. PayPal checkout does not depend on this script.
