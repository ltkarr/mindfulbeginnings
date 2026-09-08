# Card / PayPal checkout (dynamic amounts)

Registration and `pay.html` now share one PayPal/card path that charges **whatever total is on screen** (including promo codes) and, after a successful capture, marks the matching `registrations` row:

- `pay_status = 'paid'`
- `paypal_tx_id` = PayPal capture id
- `price_paid` = amount actually charged

Venmo and Zelle are unchanged as off-platform options. Their memo now includes `Reg <registration id>` plus the student and course so Lindsay can match them.

The old PayPal No Code Payments / hosted-button URL (`/ncp/payment/V9QPR5SLN9DD4`) is no longer used. It could only charge a single fixed amount, which is why discounted card payments were previously hidden.

## What you must set (Vercel)

In the Vercel project → **Settings → Environment Variables** (Production + Preview):

| Variable | Required | Notes |
|---|---|---|
| `PAYPAL_CLIENT_ID` | **Yes** | From [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications) → your app. This value is public (the browser SDK uses it). |
| `PAYPAL_CLIENT_SECRET` | **Yes** | Same app. **Never** put this in `config.js` or any HTML file. |
| `PAYPAL_ENV` | Recommended | `live` (default) or `sandbox`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** (to auto-mark paid) | Supabase → Project Settings → API → `service_role`. Server-only. Without it, PayPal still charges, but the registration stays `pending`. |
| `SUPABASE_URL` | Optional | Defaults to `https://evninlytzhtacanrguhx.supabase.co`. |
| `PAYPAL_WEBHOOK_ID` | Recommended | Lets PayPal mark the row paid even if the family closes the tab after paying. |

Redeploy after saving env vars. Card/PayPal buttons stay hidden until `PAYPAL_CLIENT_ID` **and** `PAYPAL_CLIENT_SECRET` are both set (`GET /api/paypal/config` returns `{ configured: true }`).

Do **not** invent or paste fake credentials into the repo. Leave these blank until you copy the real values from PayPal / Supabase.

## PayPal app setup

1. Create (or open) a REST app in the PayPal Developer Dashboard.
2. Copy the **Client ID** and **Secret** into the Vercel env vars above.
3. Under app settings, add your live domains, e.g.:
   - `https://mindfulbeginnings.vercel.app`
   - `https://mindfulbeginnings.org` (if you use a custom domain)
4. Enable **Checkout / Orders v2**.
5. (Recommended) Add a webhook:
   - URL: `https://<your-domain>/api/paypal/webhook`
   - Events: `PAYMENT.CAPTURE.COMPLETED` and `CHECKOUT.ORDER.APPROVED`
   - Copy the Webhook ID into `PAYPAL_WEBHOOK_ID`

Sandbox: set `PAYPAL_ENV=sandbox` and use sandbox client id/secret. Use a PayPal sandbox buyer account to test.

## How the flow works

1. `register.html` still saves the seat as `pending` **before** payment (register-first). Host / comp / auction / prepaid / waitlist are unchanged.
2. The payment screen always offers card/PayPal at the **current** total, including after a promo is applied.
3. PayPal JS SDK Smart Buttons call:
   - `POST /api/paypal/create-order` with `{ amount, registrationId, studentName, course }`
   - `POST /api/paypal/capture-order` with `{ orderID, registrationId }`
4. The capture route talks to PayPal with the secret, then updates Supabase with the service role. Existing `paid` / `host` / `in_kind` rows are never overwritten.
5. If the family closes the tab after paying, the webhook is the backup.

`pay.html` uses the same buttons. Pass `?reg=<registration id>&amt=215&name=Emma%20Smith&for=Safe%20Sitter` so a reminder link can auto-mark that row paid and prefill the Venmo/Zelle memo.

## Local check

```bash
npm test
vercel dev   # needed to exercise /api/paypal/* locally
```

Without PayPal env vars, Venmo and Zelle still work; card/PayPal shows a short “not configured yet” note.
