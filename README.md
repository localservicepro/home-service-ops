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
| `GOOGLE_MAPS_API_KEY` | Google Business Profile rating and review requests. Also used by the Dispatch map: to place addresses when the Geocoding API is enabled for the key, and for directions with live traffic when the Routes API is enabled. Without those, OpenStreetMap is used. |
| `OSRM_URL` | Optional. Your own OSRM server for Dispatch road routes and travel times. Default: the public server at `router.project-osrm.org`, which is free but meant for light use. |

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

## Staff admin (/admin)

Local Service Pro staff run the app from `https://home.localservicepro.com.au/admin`. It works on this app's own data; Sales Brain only receives a copy for central tracking. Staff are users with `role = 'admin'` (add someone with `update hso.users set role = 'admin' where email = '…'`).

- **Dashboard:** monthly recurring revenue, revenue for the last 30 days, customers with access, sign-ups and lost customers, each with a trend against the previous period. Charts for revenue (12 months or 30 days) and sign-ups (day, week, month), the customer mix, top trades, recent payments, plans and payment health, trials ending, overdue payments, recent cancellations, cancel reasons, activity and a support snapshot. Times are in Brisbane time.
- **Customers:** search and filter every business. Each one shows details, plan and billing, payment history, usage, team, support requests and staff notes. Staff can give or remove free access, extend a trial, cancel a subscription, **suspend access** (nobody at the business can use the app until it's reinstated; they can still message support) and **delete the account** (typed confirmation; cancels billing and removes logins used only there).
- **Support overview:** open, waiting, urgent and unassigned counts, average first reply and time to solve, requests per day (new vs solved), categories, priorities, team workload and the requests waiting longest.
- **Tickets:** a pipeline board with New → In progress → Waiting on customer → Solved → Closed (solved and closed show the last 30 days). Drag a request between stages to change its status, or click it to open the conversation in a side panel: reply (emailed to the customer), add an internal note (never shown to the customer), assign, set priority. A List view keeps the filters and search. Sales Brain receives "in progress" as open, since its statuses are open, pending, solved and closed.
- **Sales Brain sync:** delivery status of the feed.

Revenue comes from the payments ledger `hso.billing_payments`, filled from Stripe's `invoice.paid`, `invoice.payment_failed` and `charge.refunded` events.

**View as customer.** On a customer's page (or beside a ticket), "View as customer" opens their account in that browser tab as its owner, with the staff member's own login: no customer password, and the customer's own sessions aren't touched. Staff give a reason and a time limit (30 minutes to 2 hours). It's read-only unless "Allow changes" is ticked; then every change (method and path) is recorded. A banner shows on every page with an Exit button. Each view is noted on the account and listed under "Support views" with its change count (`hso.support_sessions`, `hso.support_session_actions`). It works for suspended and expired accounts too. Deleting a login and creating a web link are refused while viewing.

**Demo data.** The sidebar's Demo data card loads 24 sample customers with a year of payments, jobs and support conversations, resets them, or removes them. Demo businesses are flagged `is_demo`: they never reach Sales Brain, have no logins and use example.com addresses. Removing them deletes only demo rows.

Customers reach support from the **Support** button (the life-ring in the top bar on phones, the sidebar on larger screens) or Settings → Help & support. A badge shows when support has replied.

## Sales Brain

The app pushes account, payment and support-ticket changes to Sales Brain (`POST https://app.salesbrain.com.au/api/integrations/lsp-app`). Sales Brain only receives; this app stays the source of truth.

**Secret.** Set `LSP_APP_SHARED_SECRET` as a Supabase Edge Function secret (Dashboard → Edge Functions → Secrets, or `supabase secrets set LSP_APP_SHARED_SECRET=…`). It is read server-side only, never logged, and never sent to the browser. Until it's set, events queue up and nothing is sent. Optional: `SALES_BRAIN_ALERT_EMAIL` (who hears about events that keep failing, default info@localservicepro.com.au) and `SUPPORT_EMAIL` (new support tickets, default support@localservicepro.com.au).

**How it works.**
- Each change writes an event to `hso.salesbrain_outbox` in the same transaction, with its id fixed at that point, so retries resend the same id.
- The `hso-salesbrain` pg_cron job calls `API/cron/salesbrain` every minute. It sends up to 500 events per request, signed with `x-lsp-timestamp` and `x-lsp-signature: sha256=HMAC("<timestamp>.<body>")`.
- 200 marks them sent. 207 marks only the named events as rejected. A 400 on a batch resends each event alone to find the bad one. 401 holds everything until the secret or clock is fixed. 503, other 5xx and network errors back off 1m, 5m, 30m, 2h, then email an alert and keep retrying every 2h.
- `account.upserted` goes out on sign-up, plan change, every status change, profile changes, and once a day for usage (from the 15-minute `/cron/tick`). `payment.recorded` comes from Stripe `invoice.paid`, `invoice.payment_failed` and `charge.refunded`. `ticket.upserted` comes from Settings → Help & support and the staff replies in `/admin`.
- Add `charge.refunded` to the Stripe billing webhook's events so refunds reach Sales Brain.

**Accounts from Sales Brain (Sales Brain → this app).** Sales Brain creates app accounts for clients whose plan includes the app, and ends that free access when their plan stops. It sends `POST https://home.localservicepro.com.au/api/integrations/sales-brain` (Vercel forwards `/api/integrations/*` to the `api` function; the direct URL `https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/integrations/sales-brain` works too). Sales Brain's `LSP_APP_URL` is `https://home.localservicepro.com.au`.

Requests are verified exactly like Sales Brain verifies ours: `x-lsp-timestamp` (unix seconds, within 5 minutes) and `x-lsp-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with LSP_APP_SHARED_SECRET>`, compared in constant time. Wrong or stale gives 401.

```json
{ "events": [
  { "id": "sb-1234-provision", "type": "account.provision", "data": {
      "sales_brain_customer_id": "3f6c2a1e-8b4d-4c2a-9f1e-2d7b6a5c4e3f",
      "business_name": "Bob's Lawns", "owner_name": "Bob Smith", "email": "bob@bobslawns.com.au",
      "phone": "0400 000 000", "abn": "12 345 678 901", "address": "1 Main St, Brisbane QLD 4000",
      "trade": "Lawn & Garden", "services": ["Lawn mowing & edging"], "service_areas": ["Brisbane North"],
      "website": "https://bobslawns.com.au", "google_profile": "https://g.page/bobslawns",
      "plan": "Growth", "access": "included" } },
  { "id": "sb-1234-ended", "type": "account.access_ended", "data": {
      "sales_brain_customer_id": "3f6c2a1e-8b4d-4c2a-9f1e-2d7b6a5c4e3f", "account_id": "101",
      "email": "bob@bobslawns.com.au", "ends_at": "2026-12-01T00:00:00+10:00" } }
] }
```

- `account.provision` finds the account by `sales_brain_customer_id`, then by the owner's email. With none, it creates the business and owner login from the details: name, ABN, address, trade (matched to the app's trades), services (priced from that trade's starter list when the name matches, otherwise $0), service areas, phone and website. The owner gets the app's normal invite email ("Create my login", 14 days). Status `created`. An existing account is linked instead: its subscription is cancelled now with no further charges, and it moves to the free plan. Status `linked`. Either way the account is on **Included with Sales Brain**: no card, no trial end, no charges.
- `account.access_ended` keeps the account and all its data. From `ends_at` it comes off the free plan and is treated like an account without a subscription, so the app asks them to subscribe. Status `ended`. The 15-minute tick switches it off; billing checks honour `ends_at` to the second. A later `account.provision` gives free access again.
- Each event id is processed once (`hso.salesbrain_inbound`). The same id again returns the stored result.
- Reply `200 {"results":[{"id","account_id","status"}]}`. If any event's data is wrong, `400` with `{"id","error"}` for that event (the others are still processed and listed). A problem on our side is `503`, and the event isn't stored, so resending works.
- After each change an `account.upserted` goes back to Sales Brain with `sales_brain_customer_id`, `plan` "Included with Sales Brain" and `mrr_cents` 0. After access ends it reports `status` cancelled with `cancelled_at` = `ends_at`.

**Test the connection.** Sign in as a staff user (`users.role = 'admin'`) and open `/admin` → Sales Brain → **Test Sales Brain connection**. It sends a signed GET with an empty body and expects `200 {"ok":true}`. The same tab shows the queue, events that were rejected or held, and **Resend held & rejected** once the cause is fixed.

**Backfill (run once, after the secret is set).** `/admin` → Sales Brain → **Run backfill**, or from SQL:

```sql
select net.http_post(
  url := 'https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/cron/salesbrain_backfill',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hso_cron_key')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
```

It queues every real account, every payment in the ledger (paid, failed, refunded) plus the last 90 days of Stripe invoices and refunds, and every ticket. Demo customers are never sent. Ids are fixed by each record's current state (`backfill-account-<id>-<hash of the account data, usage included>`, `ledger-payment-<id>-<status>`, `backfill-payment-<invoice>-paid`, `refund-<id>`, `backfill-ticket-<id>-<updated ms>`), so running it again only queues what changed since. It reports `queued` (new) and `total` for each. The cron sends the queue over the next few minutes.

`usage` on every `account.upserted` holds the account's current numbers, flat (`helpers/accountUsage.tsx`). Windows are the last 30 days and money is integer cents:
- **Team:** `users`, `crew_total`, `logins_last_30d`, `active_days_last_30d`, `active_users_last_30d`.
- **Customers:** `customers_total`, `customers_new_last_30d`.
- **Jobs:** `jobs_last_30d`, `jobs_created_last_30d`, `jobs_completed_last_30d`, `completed_value_last_30d_cents`, `jobs_total`, `leads_last_30d`.
- **Quotes:** `quotes_last_30d`, `quotes_sent_last_30d`, `quotes_won_last_30d`, `quotes_lost_last_30d`, `quotes_won_last_30d_cents`, `quote_win_rate_last_30d_pct`, `quotes_open`, `quotes_open_cents`, `quotes_total`.
- **Invoices and payments:** `invoices_last_30d`, `invoiced_last_30d_cents`, `payments_collected_last_30d`, `collected_last_30d_cents`, `unpaid_jobs`, `outstanding_cents`.
- **Bookings and reviews:** `booked_ahead_jobs`, `booked_ahead_cents`, `review_requests_last_30d`.
- **Dates and state:** `last_job_at`, `last_quote_at`, `subscription_status`, `trial_ends_at`, `cancels_at`, `open_tickets`.

Sign-ins and active days come from `hso.account_sessions` (each Auth session once) and `hso.account_activity` (each member per Brisbane day). They're recorded on every signed-in request, but not during staff support views.

`sales_brain_customer_id` is sent on every `account.upserted`: the UUID Sales Brain sent in `account.provision` for accounts it created, otherwise `null`.

**Live dashboard numbers for Sales Brain.** `GET /api/integrations/sales-brain/summary?days=30` (add `&include_demo=1` to count demo customers), signed with `x-lsp-timestamp` and `x-lsp-signature: sha256=<HMAC-SHA256 of "<timestamp>.">`. It returns revenue, customers and support computed by the same code as /admin's Dashboard and Support overview (`helpers/adminMetrics.tsx`). 401 on a bad or stale signature, 400 on a bad `days`.

**Per-customer reads for Sales Brain.** Same signature. Demo customers are left out unless `include_demo=1`. Money is integer cents, AUD.

- `GET /api/integrations/sales-brain/customers?range=month` lists every customer. Each entry has the account (status, access, plan, MRR, sign-up, last active, users, open tickets) and `analytics` from the customer's own dashboard: money collected, jobs completed, outstanding and overdue, booked ahead, quotes and win rate, payment methods, top services, lead sources, crew and pipeline. `range` is `month`, `quarter` or `fy` (the Australian financial year), bucketed in Brisbane time.
- `GET /api/integrations/sales-brain/customer?account_id=N&range=month` returns one customer in full: account, billing and payments to us, team, pending invites, usage totals, analytics and tickets.
- `GET /api/integrations/sales-brain/tickets` lists support tickets. Add `status=open,in_progress,pending,solved,closed` or `active`, and/or `account_id=N`. `ticket_id=N` returns one ticket with its whole conversation, with internal staff notes marked `internal_note`.

The account fields come from the staff admin's rules (`helpers/adminData.tsx`). The analytics come from the customer dashboard's own maths (`helpers/dashboardStats.tsx`), through `helpers/salesBrainCustomers.tsx`.

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
