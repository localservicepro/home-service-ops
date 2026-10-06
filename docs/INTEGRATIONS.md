# Connecting the integrations

Every integration key is a **Supabase Edge Function secret**. They are not Vercel environment variables: the integration code runs in the Supabase `api` function, and anything in a `VITE_` Vercel variable is published inside the website's JavaScript.

All callback and webhook URLs below start with:

```
https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/
```

That prefix is written as **`API/`** below. The web app lives at **`https://home.localservicepro.com.au`**. `https://home-service-ops.vercel.app` still works too.

Until an integration's secrets are set, its card in **Settings → Integrations** says it isn't set up yet, and nothing else is affected. Add them in any order.

---

## How to add a secret in Supabase

1. Open supabase.com → your project (**gcuzmuztikisxsmkgtbi**).
2. In the left sidebar, choose **Edge Functions**, then **Secrets** (also under **Project Settings → Edge Functions**).
3. Click **Add new secret**. Enter the **name exactly as written below** (capitals and underscores) and paste the value. Save.
4. Secrets apply to the next request; you don't need to redeploy.

To change a secret, edit it in the same place. Never paste these into Vercel, GitHub or the code.

---

## 1. Email (Resend): do this first

**Secrets:**
- `RESEND_API_KEY`: the key Claude created ("Home Service Ops (Supabase api function)", send-only, limited to `home.localservicepro.com.au`)
- `EMAIL_DOMAIN`: optional; the default is already `home.localservicepro.com.au`

**DNS records:** add these at the DNS host for `localservicepro.com.au`, the same place you added the `home` record that points at Vercel (your domain registrar, Cloudflare and so on; it isn't Vercel). The **Name** is the part before `.localservicepro.com.au`. Some hosts want the full name instead, such as `resend._domainkey.home.localservicepro.com.au`.

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.home` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGCU1oJRCJait6xTcyikS6GqBit++bykyi35a+Fk/lj/9e81hj3JcT1CBJ3VoMYWPBuHsyya2NeY5bxQdwpFj48B2JUXlwGOAPtVJhh8M0O5LynLIyGUvfgBmMuIdQebhfxLogiuG44jy5qiQ23iUL6UK0Wi9p7+qwt/kAIO3UrwIDAQAB` | |
| MX | `send.home` | `feedback-smtp.ap-northeast-1.amazonses.com` | 10 |
| TXT | `send.home` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend.home` | `send.forge.rmta.net` | |
| TXT (recommended) | `_dmarc.home` | `v=DMARC1; p=none; rua=mailto:info@localservicepro.com.au` | |

These don't touch the `home` record that points the app at Vercel, or the root domain's own email.

**After the DNS is in:** go to resend.com → **Domains → home.localservicepro.com.au → Verify DNS records**. It's ready once all rows are green, usually within minutes.

**Test:** in the app, send a quote to your own Gmail. It should arrive from `"<Business name>" <hello@home.localservicepro.com.au>`. Replying should go to the business's email.

---

## 2. Stripe: card pay-now links and Home Service Ops subscriptions

There are two separate uses:
- **Stripe Connect:** each business connects its own Stripe account, and invoices get a pay-now link.
- **Billing:** businesses pay you for Solo ($49) or Team ($129) plans.

Use the **Test mode** keys first and switch to live once you've tried it.

**A. API keys**
1. Go to dashboard.stripe.com → **Developers → API keys**.
2. Copy the **Secret key** (`sk_test_…`, later `sk_live_…`) → secret **`STRIPE_SECRET_KEY`**.

**B. Connect (lets businesses link their own Stripe)**
1. Go to **Settings → Connect → Onboarding options → OAuth** (or Connect settings → "OAuth for Standard accounts").
2. Turn on **OAuth for Standard accounts**.
3. Under **Redirects**, add `API/stripe/callback`.
4. Copy the **Client ID** (`ca_…`) → secret **`STRIPE_CLIENT_ID`**.

**C. Webhook for invoice payments (marks jobs Paid)**
1. Go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `API/stripe/webhook`.
3. Choose **Events from connected accounts** ("Listen to events on Connected accounts").
4. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
5. Save, then reveal the **Signing secret** (`whsec_…`) → secret **`STRIPE_WEBHOOK_SECRET`**.

**D. Webhook for subscriptions**
1. **Add endpoint** again. Endpoint URL: `API/stripe/billing_webhook`.
2. Choose **Events on your account**.
3. Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
4. Copy its **Signing secret** → secret **`STRIPE_BILLING_WEBHOOK_SECRET`**.

The plan prices (AUD, `hso_solo_monthly_aud` and `hso_team_monthly_aud`) are created in Stripe automatically the first time someone picks a plan. You can also turn on the **Customer portal** (Settings → Billing → Customer portal) so "Manage billing" works.

---

## 3. Square: card links, as an alternative to Stripe

1. Go to developer.squareup.com → **Applications → + New application** ("Home Service Ops").
2. Switch the toggle at the top between **Sandbox** and **Production**.
   - With sandbox credentials (the app ID starts with `sandbox-`), the app uses Square's sandbox automatically.
3. Under **Credentials**, copy:
   - the **Application ID** → secret **`SQUARE_APP_ID`**
   - the **Application secret** → secret **`SQUARE_APP_SECRET`**
4. Under **OAuth**, set the **Redirect URL** to `API/square/callback`.
5. Under **Webhooks → Subscriptions → Add subscription**:
   - URL: `API/square/webhook`
   - Events: `payment.updated` and `payment.created`
   - Copy the **Signature key** → secret **`SQUARE_WEBHOOK_SIGNATURE_KEY`**.

The scopes requested on connect are `ORDERS_READ/WRITE`, `PAYMENTS_READ/WRITE` and `MERCHANT_PROFILE_READ`. A business picks Stripe or Square as its card provider in Settings → Payments.

---

## 4. GoCardless: BECS direct debit

GoCardless needs a **partner** app. Approval is required before you can go live, but sandbox works straight away.

1. Sign up at manage-sandbox.gocardless.com (sandbox) and, later, manage.gocardless.com (live).
2. Go to **Developers → Create → Partner app**.
3. Set the **Redirect URL** to `API/gocardless/callback`.
4. Copy:
   - the **Client ID** → secret **`GOCARDLESS_CLIENT_ID`**
   - the **Client secret** → secret **`GOCARDLESS_CLIENT_SECRET`**
5. Set secret **`GOCARDLESS_ENVIRONMENT`** to `sandbox` now, and to `live` after approval, with the live app's ID and secret.
6. Go to **Developers → Create → Webhook endpoint**:
   - URL: `API/gocardless/webhook`
   - Copy the **Secret** → secret **`GOCARDLESS_WEBHOOK_SECRET`**.

It handles billing request, mandate and payment events, plus organisation disconnects.

---

## 5. Xero: invoices and payments in the business's books

1. Go to developer.xero.com → **My Apps → New app**:
   - App name: "Home Service Ops"
   - Integration type: **Web app**
   - Company URL: `https://home.localservicepro.com.au`
   - Redirect URI: `API/xero/callback`
2. Open **Configuration**:
   - copy the **Client id** → secret **`XERO_CLIENT_ID`**
   - click **Generate a secret** → secret **`XERO_CLIENT_SECRET`**
3. Scopes requested on connect: `openid profile email offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read`. New Xero apps use granular scopes, so tick these if the portal asks.
4. Set up the **Webhooks** tab:
   - Delivery URL: `API/xero/webhook`
   - Event: **Invoices** (create and update)
   - Copy the **Webhooks key** → secret **`XERO_WEBHOOK_KEY`**
   - Save. Then click **Send "Intent to receive"**, which needs the secret saved first.
5. Xero's free developer tier allows up to 5 connected organisations; beyond that you need their paid partner plan.

In the app, each business picks a mode: **Invoice & collect in Xero**, or **Record paid jobs**.

---

## 6. LeadConnector / GoHighLevel: leads in, pipeline sync out

1. Go to marketplace.gohighlevel.com → **My Apps → Create App**:
   - App type: **Private** (just your agency) or **Public**
   - Distribution: **Sub-account**
2. Go to **Auth → Redirect URLs** and add `API/crm/callback`.
3. Under **Scopes**, add `locations.readonly`, `contacts.readonly`, `contacts.write`, `opportunities.readonly` and `opportunities.write`.
4. Copy the **Client ID** → secret **`LC_CLIENT_ID`**. Generate a **Client secret** → secret **`LC_CLIENT_SECRET`**.
5. Set up **Webhooks**:
   - Default webhook URL: `API/crm/webhook`
   - Events: `OpportunityCreate` (new leads become requests) and `AppUninstall` (disconnects cleanly). Stage changes made in the app are pushed to LeadConnector through the API, so they don't need a webhook.
   - Signatures are checked with GoHighLevel's published public key, which is already in the code, so there's no secret to add.

LeadConnector sync is a **Team plan** feature. A business connects it in Settings → Integrations → Calendar & CRM and maps its pipeline stages there.

---

## 7. Google: three separate pieces

All three use Google Cloud Console (console.cloud.google.com). Create a project ("Home Service Ops") first.

**OAuth consent screen (once):** go to **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding).
- App name: "Home Service Ops"
- Support email: yours
- Authorised domain: `localservicepro.com.au`
- Add the scopes `openid`, `email`, `profile` and `https://www.googleapis.com/auth/calendar.events`.
- Publish the app to **In production** when ready. In "Testing" mode only listed test users can sign in.

**A. "Continue with Google" sign-in.** This is set in Supabase, not as secrets.
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application** ("HSO sign-in").
2. Authorised redirect URI: `https://gcuzmuztikisxsmkgtbi.supabase.co/auth/v1/callback`.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**. Turn it on and paste this client's ID and secret.

**B. Google Calendar sync**
1. Go to **APIs & Services → Library**, find **Google Calendar API** and click **Enable**.
2. Create another **OAuth client ID (Web application)** ("HSO calendar"):
   - Authorised redirect URI: `API/gcal/callback`
   - Authorised JavaScript origin: `https://home.localservicepro.com.au`
3. Copy its ID → secret **`GCAL_CLIENT_ID`**, and its secret → secret **`GCAL_CLIENT_SECRET`**.

**C. Google Business Profile reviews (rating plus review-request emails)**
1. Go to **APIs & Services → Library**, find **Places API (New)** and click **Enable**. This needs billing on the Google Cloud project, but light use stays inside the free tier.
2. Go to **Credentials → Create credentials → API key**.
3. Edit the key: under **API restrictions**, choose Restrict key → **Places API (New)**. Leave Application restrictions as None, because the server calls it.
4. Copy it → secret **`GOOGLE_MAPS_API_KEY`**.

---

## 8. Supabase Auth URLs (needed for the new domain)

Go to **Authentication → URL Configuration**:
- **Site URL:** `https://home.localservicepro.com.au`
- **Redirect URLs:** keep `https://home-service-ops.vercel.app/**` and add `https://home.localservicepro.com.au/**`

Also set **APP_URL** = `https://home.localservicepro.com.au` as a Supabase secret. It's already the default, so this is only needed if you change domains later.

---

## Checklist

| Secret | Integration |
| --- | --- |
| `RESEND_API_KEY` | Email |
| `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe |
| `SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square |
| `GOCARDLESS_CLIENT_ID`, `GOCARDLESS_CLIENT_SECRET`, `GOCARDLESS_ENVIRONMENT`, `GOCARDLESS_WEBHOOK_SECRET` | GoCardless |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_WEBHOOK_KEY` | Xero |
| `LC_CLIENT_ID`, `LC_CLIENT_SECRET` | LeadConnector |
| `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET` | Google Calendar |
| `GOOGLE_MAPS_API_KEY` | Google reviews |
| Supabase → Auth → Providers → Google (client ID and secret) | Google sign-in |

| Provider | Callback URL | Webhook URL |
| --- | --- | --- |
| Stripe | `API/stripe/callback` | `API/stripe/webhook` (connected accounts), `API/stripe/billing_webhook` (your account) |
| Square | `API/square/callback` | `API/square/webhook` |
| GoCardless | `API/gocardless/callback` | `API/gocardless/webhook` |
| Xero | `API/xero/callback` | `API/xero/webhook` |
| LeadConnector | `API/crm/callback` | `API/crm/webhook` |
| Google Calendar | `API/gcal/callback` | n/a |
| Google sign-in | `https://gcuzmuztikisxsmkgtbi.supabase.co/auth/v1/callback` | n/a |

(`API/` = `https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/`)
