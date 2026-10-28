# Home Service Ops — by Local Service Pro

A job-management SaaS for Australian home-service businesses (lawn care, gardening, property maintenance and similar trades). It covers the whole job lifecycle — enquiry → quote → booking → crew on site → invoice → payment → review — with an office web app, a crew mobile app, customer-facing quote/invoice pages and integrations into the tools trades already use.

- Built on **Floot** (project `58f66b5c-2c1e-477a-9656-04a9f5919da4`), published at `https://localservicepro.floot.app`, also packaged as an iOS/Android app (Capacitor via Floot).
- Exported: October 2026. 502 source files (Floot's UI-kit `*.example.*` demo files left out).

---

## 1. What the app does

### Office (owner / admin)
| Area | What it does |
|---|---|
| **Home dashboard** | Period switch (month / quarter / Australian FY). KPIs: money collected (vs last period), outstanding, work completed + average job, booked ahead. Strip: jobs today, new requests, booked this week, open quotes, quote win rate, crew on duty, Google rating. Revenue chart (paid / awaiting / booked), quotes win-rate ring, awaiting-payment list with ageing, pipeline with $ per stage, top services, payment mix, lead sources, crew performance, recent activity. |
| **Quotes** | Pipeline board: New requests → Draft → Sent → Declined (drag to move). Quote builder with service/add-on catalogue, editable prices, custom lines, discount, GST, customer photos (full-screen viewer). Send by email; customer accepts/declines online; accepted quotes move to Jobs. |
| **Jobs** | Pipeline board (To schedule → Scheduled → In progress → Done → Paid). Job page: status pipeline, customer + map + directions, crew assignment, notes, photos, invoice lines/extras, take payment, Google review and Xero panels. |
| **Schedule** | Month calendar of booked jobs. |
| **Payments** | What's owed / paid, send invoices, pay links. |
| **Clients** | Client list + profile (properties, jobs, quotes, totals, review opt-out). |
| **Crew** | Crew members, pay rates (hourly/per job), duty status, logins/invites. |
| **Settings** | Profile & business details; Services & add-ons; Payment settings (methods, bank details, card provider); Plan & billing; Team & logins; **Integrations** (tabbed: Calendar & CRM · Payments · Accounting · Reviews); **Website form** builder. |

### Crew app (`/field`)
Today's assigned jobs, start/finish timer, before/after photos, notes, collect payment on site, profile.

### Customer-facing pages (no login)
- `/q/:token` — online quote: view, accept or decline (with reason).
- `/i/:token` — online invoice: pay by card (Stripe or Square), direct debit (GoCardless), Xero pay link, or bank transfer; print/PDF.
- `/f/:key` — website enquiry form (embeddable).
- `/welcome` + `/` (signed out) — animated marketing landing page with plans and "Start free trial".

### SaaS / accounts
- Multi-tenant: every business's data is isolated (`helpers/tenant.tsx → requireMember`). Roles: owner, admin, crew.
- Sign-up with email/password or **Google sign-in**; password reset; team invites by link.
- Onboarding wizard with trade templates (pre-loaded services).
- **Subscriptions via Stripe Billing** (`helpers/plans.tsx`): 14-day free trial, then
  - **Solo** $49/mo AUD (60 scheduled jobs/month, 1 owner + 2 crew)
  - **Team** $129/mo AUD (400 jobs/month, 3 office + 15 crew, LeadConnector sync)
  - Upgrade/downgrade, cancel/resume, billing details, card update, invoices. Expired trials become read-only.

---

## 2. Integrations

| Integration | How it works | Code |
|---|---|---|
| **LeadConnector / GoHighLevel** | OAuth per business. Pulls new leads into Requests, pushes jobs/quotes to an LC pipeline with stage mapping, webhook + 3-minute office sync. | `helpers/leadConnector.tsx`, `helpers/lcSync.tsx`, `endpoints/crm/*` |
| **Google Calendar** | OAuth per business; scheduled jobs are added/moved/removed automatically (Australia/Sydney). | `helpers/googleCalendar.tsx`, `helpers/calendarSync.tsx`, `endpoints/gcal/*` |
| **Stripe Connect** | Each business connects its own Stripe; pay-now links on invoices; webhook marks jobs Paid. | `helpers/stripeConnect.tsx`, `endpoints/stripe/*` |
| **Square** | OAuth; Square payment links; webhook + polling mark jobs Paid. Business chooses Stripe or Square as card provider. | `helpers/squareConnect.tsx`, `endpoints/square/*` |
| **GoCardless** | Partner OAuth; AU BECS direct debit: customer authorises once, then each job is charged with one tap; status via webhook. | `helpers/goCardless.tsx`, `endpoints/gocardless/*` |
| **Xero** | OAuth (granular scopes). Two modes: *Invoice & collect in Xero* (Done job → approved invoice in Xero, optionally emailed by Xero; payment in Xero marks the job Paid via webhook/polling) or *Record paid jobs* (paid job → paid invoice). Contact matching, GST, sales + payment account pickers, retries. | `helpers/xero.tsx`, `endpoints/xero/*` |
| **Google Business Profile** | Search & pick listing (Places API New) → rating/review count. Opt-in automatic review-request emails after Done or Paid with delay, once per job, 90-day re-ask guard, unsubscribe link, manual send. | `helpers/reviews.tsx`, `endpoints/gbp/*`, `components/GbpCard.tsx` |
| **Website enquiry form** | Builder (colour, logo, text, fields shown/required, services listed). Embed: `<script src="https://localservicepro.floot.app/_api/embed" data-hso-form="KEY" async></script>`, iFrame or direct link. Submissions create/update the client and a New request with priced service lines and up to 5 photos; owner email alert; spam guards (honeypot, timing, rate limit). | `helpers/leadForms.tsx`, `helpers/leadFormConfig.tsx`, `pages/f.$key.tsx`, `pages/settings.form.tsx` |
| **Email** | Branded transactional email (quotes, invoices, invites, review requests, alerts) from `mail.localservicepro.com.au` via Floot email. | `helpers/mailer.tsx` |

---

## 3. Tech stack & structure

- **Frontend:** React 19, React Router 6, TanStack Query, CSS Modules, Radix UI primitives, lucide icons, Sonner toasts. Fonts: Plus Jakarta Sans + IBM Plex Mono. Responsive: phone (bottom nav), tablet (rail), laptop/desktop (sidebar).
- **Backend:** Floot serverless endpoints (`endpoints/<route>_GET|_POST.ts` + `.schema.ts` with zod input + typed client fetcher), superjson.
- **Database:** PostgreSQL via Kysely (CamelCase plugin). Types: `helpers/schema.tsx`.
- **Platform packages:** `@floot/email`, `@floot/storage` (file uploads/CDN). These are Floot-specific — replace them if you move off Floot.

```
pages/        Routes (file name = URL; $param = dynamic; *.pageLayout.tsx = shell; [] = no shell)
components/   UI (AppShell, PipelineBoard, QuoteBuilder, PaymentSheet, integration cards, UI kit)
helpers/      Server + shared logic (tenant, billing, integrations, pricing, formatting, hooks)
endpoints/    API routes, served at /_api/<route>
static/       Assets; static/__dev = Floot dev metadata (deps, design principles, native config)
base.css      Design tokens (navy command surfaces + blue→cyan signal gradient)
```

### Main database tables
businesses, memberships, users, sessions, user_passwords, password_resets, invites, settings, services, addons, clients, staff, jobs, quotes, plus integration tables: lc_connection / lc_oauth_states / lc_opportunities, gcal_connection / gcal_oauth_states, stripe_connection / stripe_oauth_states, square_connection / square_oauth_states, gocardless_connection / gocardless_oauth_states, xero_connection / xero_oauth_states, gbp_connection, lead_forms / lead_form_hits, google_login_states, login_attempts.

### Environment variables / secrets
`FLOOT_DATABASE_URL`, `JWT_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET`,
`SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
`GOCARDLESS_CLIENT_ID`, `GOCARDLESS_CLIENT_SECRET`, `GOCARDLESS_ENVIRONMENT`, `GOCARDLESS_WEBHOOK_SECRET`,
`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_WEBHOOK_KEY`,
`LC_CLIENT_ID`, `LC_CLIENT_SECRET`, `GHL_PUBLIC_KEY`,
`GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY`.
(No secret values are included in this export.)

### Callback / webhook URLs (live domain)
- Stripe: `/_api/stripe/callback`, `/_api/stripe/webhook`, `/_api/stripe/billing_webhook`
- Square: `/_api/square/callback`, `/_api/square/webhook`
- GoCardless: `/_api/gocardless/callback`, `/_api/gocardless/webhook`
- Xero: `/_api/xero/callback`, `/_api/xero/webhook`
- LeadConnector: `/_api/crm/callback`, `/_api/crm/webhook`
- Google Calendar: `/_api/gcal/callback` · Google sign-in: `/_api/auth/google/callback`

---

## 4. Status & open items (as of export)

- **Floot hosting is suspended** (credit balance empty): the live app and its database are offline until hosting credits are topped up and the app is published again. Data is preserved.
- Free-plan limits hit often (100 build actions/day, 400/week; "Made with Floot" badge shown, incl. on the embedded website form).
- To finish: verify email sending domain `mail.localservicepro.com.au` in Floot; GoCardless partner approval before live; Square/Xero production keys + webhooks; Xero webhook key + "Intent to receive"; Google OAuth consent screen to "In production"; Xero app needs Xero's paid plan beyond 5 connected organisations.
- `pages/settings.payments.tsx` still shows the payment-provider cards too (duplicate of Integrations → Payments).

## 5. Running outside Floot (rough guide)
This code relies on Floot's runtime (file-based routing for `pages/` and `endpoints/`, `@floot/email`, `@floot/storage`, env injection). To self-host you'd need to: set up a Vite/React app with a router that maps `pages/*` names to routes, an HTTP server that maps `endpoints/<route>_<METHOD>.ts` → `/_api/<route>` and calls each file's `handle(request)`, swap `@floot/email` for a provider (e.g. Resend/Postmark) and `@floot/storage` for S3 presigned uploads, and point `FLOOT_DATABASE_URL` at your Postgres (recreate the schema from `helpers/schema.tsx`).
