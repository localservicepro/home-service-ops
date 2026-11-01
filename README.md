# Home Service Ops — by Local Service Pro

Job management for Australian home service businesses (lawn care, cleaning, pressure washing, pest control, pool, handyman). It covers the whole job: enquiry → quote → booking → crew on site → invoice → payment → review. There's an office web app, a crew mobile view, customer quote and invoice pages, and integrations with the tools trades already use. Money is AUD, dates are en-AU, and GST is 10%.

The features, design and business logic come from the original app (exported from Floot, see `docs/floot-export-README.md`). It now runs entirely on **Supabase**, with Vercel serving the static frontend.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | `app/pages`, `app/components`, `app/base.css` | React 19 + React Router + TanStack Query, CSS modules. Each `pages/<name>.tsx` file is a route (`jobs.$jobId` → `/jobs/:jobId`, `_index` → `/`). `pages/<name>.pageLayout.tsx` lists the shells that wrap it. See `app/main.tsx`. |
| Sign-in | Supabase Auth | Email + password, Google, password reset. The app profile is `hso.users` (keyed by `auth_id`) and is created on first sign-in. |
| API | Supabase Edge Function `api` | One function serves every route: `app/endpoints/<route>_<GET\|POST>.ts` answers `…/functions/v1/api/<route>`. `npm run build:api` bundles it into `supabase/functions/api/index.js`. |
| Data | Supabase Postgres, schema `hso` | `supabase/migrations/20261005234026_hso_schema.sql`. Only the `api` function reaches it; RLS is on with no policies and the API roles have no grants. |
| Files | Supabase Storage, bucket `hso-public` | Job photos, form logos and enquiry photos. Uploads go straight from the browser to signed upload URLs. |
| Email | Resend, called from the `api` function | From `"<Business>" <hello@EMAIL_DOMAIN>`, with replies going to the business. |

Tenancy: every business-data endpoint starts with `requireMember()` (`app/helpers/tenant.tsx`). That resolves the Supabase user, their business and their role (owner, admin or crew), and every query then filters by that business. Crew can only touch jobs assigned to their crew record.

## Deploying

### 1. Supabase (database and API)

`.github/workflows/supabase.yml` applies the migrations and deploys the `api` function on every push to `main`. You can also run it by hand from the Actions tab. It needs two repository secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_ACCESS_TOKEN`: create one at supabase.com → Account → Access Tokens.
- `SUPABASE_DB_PASSWORD`: the database password (Project settings → Database).

Deploying without the Action (how it was first deployed): run `npm run build:api`, copy `supabase/functions/api/index.js` to `supabase/functions/api/bundle.js` and push. Then deploy an `api` function (verify JWT off) whose `index.ts` is one line, `import "https://raw.githubusercontent.com/localservicepro/home-service-ops/<commit>/supabase/functions/api/bundle.js";`, pinned to that commit.

Or with the Supabase CLI:

```bash
npm ci && npm run build:api
supabase link --project-ref gcuzmuztikisxsmkgtbi
supabase db push
supabase functions deploy api --no-verify-jwt
```

Then set the function's secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set …`). **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) walks through each provider step by step.**

| Secret | Needed for |
| --- | --- |
| `APP_URL` | The web app's URL (default `https://home.localservicepro.com.au`). Every customer link and post-OAuth redirect uses it. |
| `RESEND_API_KEY`, `EMAIL_DOMAIN` (default `home.localservicepro.com.au`) | Quote, invoice, invite, review and reset emails. Without the key, sending fails with a clear message, and password reset falls back to Supabase's built-in email. |
| `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe Connect pay links, and Home Service Ops subscriptions |
| `SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square pay links |
| `GOCARDLESS_CLIENT_ID`, `GOCARDLESS_CLIENT_SECRET`, `GOCARDLESS_ENVIRONMENT`, `GOCARDLESS_WEBHOOK_SECRET` | BECS direct debit |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_WEBHOOK_KEY` | Xero invoices and payments |
| `LC_CLIENT_ID`, `LC_CLIENT_SECRET` | LeadConnector / GoHighLevel |
| `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET` | Google Calendar sync |
| `GOOGLE_MAPS_API_KEY` | Google Business Profile rating and review requests |

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` automatically. Until an integration's keys are set, its card shows "isn't set up for this app yet".

Callback and webhook URLs to register with each provider (`API = https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api`):

| Provider | OAuth callback | Webhook |
| --- | --- | --- |
| Stripe | `API/stripe/callback` | `API/stripe/webhook`, `API/stripe/billing_webhook` |
| Square | `API/square/callback` | `API/square/webhook` |
| GoCardless | `API/gocardless/callback` | `API/gocardless/webhook` |
| Xero | `API/xero/callback` | `API/xero/webhook` |
| LeadConnector | `API/crm/callback` | `API/crm/webhook` |
| Google Calendar | `API/gcal/callback` | n/a |

Website enquiry form embed: `<script src="API/embed" data-hso-form="KEY" async></script>` (Settings → Website form shows the exact snippet).

**Supabase Auth settings:**
- URL Configuration: Site URL is the app URL. Add `https://home-service-ops.vercel.app/**` to the redirect URLs.
- Providers → Google: turn it on with a Google OAuth client. The authorised redirect URI is `https://gcuzmuztikisxsmkgtbi.supabase.co/auth/v1/callback`.
- Email confirmations can stay on. Sign-up then shows "check your inbox", and the confirmation link opens straight into onboarding.

### 2. Vercel (web app)

This is a static Vite build (`npm run build` → `dist/`) with SPA rewrites in `vercel.json`. Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`

Deploy the frontend after the API, because the new web app needs the `api` function.

## Email domain (so mail reaches inboxes)

In Resend, go to **Domains → Add domain** and enter `home.localservicepro.com.au`. Add the records it shows at your DNS host:
- MX `send`
- TXT (SPF) `send` → `v=spf1 include:amazonses.com ~all`
- TXT (DKIM) `resend._domainkey`
- Recommended: DMARC `_dmarc` → `v=DMARC1; p=none; rua=mailto:info@localservicepro.com.au`

Then click **Verify**. These records sit on a subdomain and a DKIM selector, so the domain's existing mail isn't affected.

## Sales Brain

The app pushes account, payment and support-ticket changes to Sales Brain (`POST https://app.salesbrain.com.au/api/integrations/lsp-app`). Sales Brain only receives; this app stays the source of truth.

**Secret.** Set `LSP_APP_SHARED_SECRET` as a Supabase Edge Function secret (Dashboard → Edge Functions → Secrets, or `supabase secrets set LSP_APP_SHARED_SECRET=…`). It is read server-side only, never logged, and never sent to the browser. Until it's set, events queue up and nothing is sent. Optional: `SALES_BRAIN_ALERT_EMAIL` (who hears about events that keep failing, default info@localservicepro.com.au) and `SUPPORT_EMAIL` (new support tickets, default support@localservicepro.com.au).

**How it works.**
- Each change writes an event to `hso.salesbrain_outbox` in the same transaction, with its id fixed at that point, so retries resend the same id.
- The `hso-salesbrain` pg_cron job calls `API/cron/salesbrain` every minute. It sends up to 500 events per request, signed with `x-lsp-timestamp` and `x-lsp-signature: sha256=HMAC("<timestamp>.<body>")`.
- 200 marks them sent. 207 marks only the named events as rejected. A 400 on a batch resends each event alone to find the bad one. 401 holds everything until the secret or clock is fixed. 503, other 5xx and network errors back off 1m, 5m, 30m, 2h, then email an alert and keep retrying every 2h.
- `account.upserted` goes out on sign-up, plan change, every status change, profile changes, and once a day for usage (from the 15-minute `/cron/tick`). `payment.recorded` comes from Stripe `invoice.paid`, `invoice.payment_failed` and `charge.refunded`. `ticket.upserted` comes from Settings → Help & support and the staff replies in `/admin`.
- Add `charge.refunded` to the Stripe billing webhook's events so refunds reach Sales Brain.

**Free access from Sales Brain (Sales Brain → this app).** When a customer buys a Local Service Pro website or marketing plan, Sales Brain can give them the app for free, creating their account if they don't have one. Sales Brain sends `POST https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/salesbrain/accounts`, signed exactly like our outgoing calls: same `LSP_APP_SHARED_SECRET`, `x-lsp-timestamp` and `x-lsp-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`, within 5 minutes.

```json
{
  "action": "grant",
  "external_id": "sb_customer_123",
  "email": "owner@bobsplumbing.com.au",
  "business_name": "Bob's Plumbing",
  "owner_name": "Bob Smith",
  "phone": "0400 000 000",
  "address": "1 Main St, Brisbane QLD 4000",
  "website": "https://bobsplumbing.com.au",
  "abn": "12 345 678 901",
  "note": "Included with your Local Service Pro website plan",
  "send_email": true
}
```

- `grant` needs `external_id`, `email` and `business_name`. It finds the account by `external_id`, then `account_id` (if sent), then the owner's email. If there's none, it creates the login and business and emails a welcome with a link to choose a password. It never overwrites details the customer already entered. If they were paying, their subscription is set not to renew. Repeating a grant is safe.
- `revoke` needs only `external_id` (or `account_id`). It turns free access off and leaves `grace_days` (default 14, 0 to 90) of full access to choose a plan, then emails the owner. It only removes access that Sales Brain gave; staff-given access returns 409.
- Responses: `201`/`200` `{"ok":true,"status":"created|granted|unchanged|revoked","account_id":"42","email":"…","login":"new|existing","email_sent":true}`. `400` bad body, `401` bad signature or timestamp, `404` no matching account (revoke), `409` the email belongs to a crew member of another business or is linked to a different Sales Brain customer, `503` secret not set. Every change also sends `account.upserted` back (status `active`, plan `Team (complimentary)`, `mrr_cents` 0).

**Test the connection.** Sign in as a staff user (`users.role = 'admin'`) and open `/admin` → Sales Brain → **Test Sales Brain connection**. It sends a signed GET with an empty body and expects `200 {"ok":true}`. The same tab shows the queue, events that were rejected or held, and **Resend held & rejected** once the cause is fixed.

**Backfill (run once, after the secret is set).** `/admin` → Sales Brain → **Run backfill**, or from SQL:

```sql
select net.http_post(
  url := 'https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/cron/salesbrain_backfill',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hso_cron_key')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
```

It queues every account, the last 90 days of Stripe payments and refunds, and every open or pending ticket. Ids are deterministic (`backfill-account-<id>-<YYYY-MM-DD>`, `backfill-payment-<invoice>-paid`, `refund-<id>`, `backfill-ticket-<id>-<YYYY-MM-DD>`), so running it twice on the same day queues nothing new. The cron sends the queue over the next few minutes.

**Tests.** `npm test` covers the signature (a known secret, timestamp and body give a fixed hex), every payload shape, and the response handling and backoff. They never call the real endpoint.

## Local development

The whole stack runs without Docker: Postgres, the Supabase Auth server (`auth` binary from github.com/supabase/auth releases), the API under Deno, and Vite.

```bash
# Postgres: create a database, an `auth` schema, and anon / authenticated / service_role roles, then run `auth migrate`
psql "$DB" -f supabase/migrations/20261005234026_hso_schema.sql
node scripts/build-api.mjs --dev /tmp/hso-api-dev.js
SUPABASE_DB_URL=$DB SUPABASE_URL=http://localhost:5173 AUTH_URL=http://localhost:9999 \
  STORAGE_URL=http://localhost:5173/storage/v1 APP_URL=http://localhost:5173 EMAIL_DEV_LOG=1 \
  SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… deno run -A /tmp/hso-api-dev.js   # :8787
HSO_LOCAL=1 npm run dev   # :5173; proxies /auth/v1 → :9999 and /functions/v1/api + /storage/v1 → :8787
```

`.env.local` holds `VITE_SUPABASE_URL=http://localhost:5173`, `VITE_SUPABASE_ANON_KEY` (a JWT signed with the auth server's secret) and `VITE_APP_URL`. With `EMAIL_DEV_LOG=1`, emails are logged instead of sent. The dev runner also stands in for Storage's signed uploads.

## Checks

```bash
npm run typecheck   # app + endpoints
npm test            # pricing / GST, API routing, hooks
npm run build       # web app
npm run build:api   # Edge Function bundle (fails if browser-only code leaks in)
```

## What changed from the Floot export

- Floot's cookie sessions, password hashing and login tables are replaced by Supabase Auth. The login, sign-up, reset and Google screens are unchanged; their client calls now use `supabase.auth`.
- `@floot/email` → Resend (`app/helpers/mailer.tsx`). `@floot/storage` → Supabase Storage (`app/helpers/storage.tsx`).
- Floot's file-based endpoints are served by one Edge Function (`app/server/router.ts`, with the route table generated by `scripts/gen-api-routes.mjs`). The client fetchers in `*.schema.ts` call it through `app/helpers/apiFetch.tsx`.
- Supabase serves Edge Function HTML as plain text, so OAuth popups, billing returns and unsubscribe links now finish on the app's own `/done` page.
- Every link is built from `APP_URL` and `API_URL`; nothing refers to `floot.app`.
- The data model is unchanged, apart from `users.auth_id` and an `auth_email_log` table for rate-limiting reset emails. It lives in its own `hso` schema next to the earlier prototype's `public` tables, which are no longer used.
