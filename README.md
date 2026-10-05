# Home Service Ops — by Local Service Pro

Job management for Australian home service businesses (lawn care, cleaning, pressure washing, pest control, pool, handyman). It covers the whole job: enquiry → quote → booking → crew on site → invoice → payment → review. There's an office web app, a crew mobile view, customer quote and invoice pages, and integrations with the tools trades already use. Money is AUD, dates are en-AU, and GST is 10%.

The features, design and business logic come from the original app (exported from Floot, see `docs/floot-export-README.md`). It now runs entirely on **Supabase**, with Vercel serving the static frontend.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | `app/pages`, `app/components`, `app/base.css` | React 19 + React Router + TanStack Query, CSS modules. Each `pages/<name>.tsx` file is a route (`jobs.$jobId` → `/jobs/:jobId`, `_index` → `/`). `pages/<name>.pageLayout.tsx` lists the shells that wrap it. See `app/main.tsx`. |
| Sign-in | Supabase Auth | Email + password, Google, password reset. The app profile is `hso.users` (keyed by `auth_id`) and is created on first sign-in. |
| API | Supabase Edge Function `api` | One function serves every route: `app/endpoints/<route>_<GET\|POST>.ts` answers `…/functions/v1/api/<route>`. `npm run build:api` bundles it into `supabase/functions/api/index.js`. |
| Data | Supabase Postgres, schema `hso` | `supabase/migrations/20261005000000_hso_schema.sql`. Only the `api` function reaches it; RLS is on with no policies and the API roles have no grants. |
| Files | Supabase Storage, bucket `hso-public` | Job photos, form logos and enquiry photos. Uploads go straight from the browser to signed upload URLs. |
| Email | Resend, called from the `api` function | From `"<Business>" <hello@EMAIL_DOMAIN>`, with replies going to the business. |

Tenancy: every business-data endpoint starts with `requireMember()` (`app/helpers/tenant.tsx`). That resolves the Supabase user, their business and their role (owner, admin or crew), and every query then filters by that business. Crew can only touch jobs assigned to their crew record.

## Deploying

### 1. Supabase (database and API)

`.github/workflows/supabase.yml` applies the migrations and deploys the `api` function on every push to `main`. You can also run it by hand from the Actions tab. It needs two repository secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_ACCESS_TOKEN`: create one at supabase.com → Account → Access Tokens.
- `SUPABASE_DB_PASSWORD`: the database password (Project settings → Database).

To deploy by hand instead:

```bash
npm ci && npm run build:api
supabase link --project-ref gcuzmuztikisxsmkgtbi
supabase db push
supabase functions deploy api --no-verify-jwt
```

Then set the function's secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set …`):

| Secret | Needed for |
| --- | --- |
| `APP_URL` | The web app's URL (default `https://home-service-ops.vercel.app`). Every customer link and post-OAuth redirect uses it. |
| `RESEND_API_KEY`, `EMAIL_DOMAIN` (default `home.localservicepro.com.au`) | Quote, invoice, invite, review and reset emails. Without the key, sending fails with a clear message, and password reset falls back to Supabase's built-in email. |
| `STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe Connect pay links, and Home Service Ops subscriptions |
| `SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square pay links |
| `GOCARDLESS_CLIENT_ID`, `GOCARDLESS_CLIENT_SECRET`, `GOCARDLESS_ENVIRONMENT`, `GOCARDLESS_WEBHOOK_SECRET` | BECS direct debit |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_WEBHOOK_KEY` | Xero invoices and payments |
| `LC_CLIENT_ID`, `LC_CLIENT_SECRET`, `GHL_PUBLIC_KEY` | LeadConnector / GoHighLevel |
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

## Local development

The whole stack runs without Docker: Postgres, the Supabase Auth server (`auth` binary from github.com/supabase/auth releases), the API under Deno, and Vite.

```bash
# Postgres: create a database, an `auth` schema, and anon / authenticated / service_role roles, then run `auth migrate`
psql "$DB" -f supabase/migrations/20261005000000_hso_schema.sql
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
