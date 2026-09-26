# Home Service Ops — by Local Service Pro

Multi-tenant job management for Australian home service businesses: lawn care, cleaning, pressure washing, pest control, pool and handyman.
React + TypeScript (Vite) on Supabase (Postgres, Auth, Storage, Edge Functions). Money is AUD, dates are en-AU, and GST is 10%.

## Quick start

```bash
npm install
cp .env.example .env        # set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

### Supabase setup

1. Create a project, then apply the schema:
   `supabase link --project-ref <ref> && supabase db push`
   (or paste `supabase/migrations/20260926000000_init.sql` into the SQL editor).
   This creates the tables, RLS policies, triggers, public RPCs and the `job-photos` (private) and `logos` (public) storage buckets.
2. Auth → URL configuration: set the Site URL to your app URL, and add `/reset` and `/onboarding` as redirect URLs.
3. Email (optional but recommended). Deploy the function and set its secrets:
   ```bash
   supabase functions deploy send-email
   supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="Coastal Lawn Co <jobs@yourdomain.com.au>" APP_URL=https://app.example.com.au
   ```
   Without `RESEND_API_KEY`, "send" still stamps the quote, invoice or invite as sent and copies the customer link to the clipboard, so you can text it instead.

Deploying the frontend: `npm run build` outputs a static SPA in `dist/`. SPA rewrites are included for Vercel (`vercel.json`) and Netlify (`public/_redirects`).

## How tenancy works

| Piece | Where |
| --- | --- |
| Signup creates a business and an **owner** membership (plus a settings row) | `handle_new_user` trigger on `auth.users` |
| Invite links (`/join/:token`) add **admin** or **crew** members; crew invites link to a `staff` record | `invites` table, `accept_invite()` RPC, or `invite_token` in signup metadata |
| Every business table has `business_id`, and RLS is on for **all** tables | `is_member()` / `is_office()` / `my_staff_id()` helpers |
| Crew see only jobs where `jobs.staff_id` = their staff record, and can only change status (In Progress/Done), notes, photos and the timer | `crew reads own jobs` policy + `tg_guard_crew_job_update` trigger |
| Clients, quotes, payments, settings and activity are office-only (owner/admin). Crew can read only their own staff record, so they never see anyone else's pay | policies |
| Plan/trial fields can't be edited by tenants | `tg_guard_business_update` |
| Job numbers `LC-1001…` and quote numbers `Q-501…` are per business | `tg_job_num` / `tg_quote_num` |
| `price` is always recomputed from line items: (subtotal − discount) × 1.1 when GST is on | `compute_total()` (mirrored in `src/lib/totals.ts`) |
| Customer pages `/q/:token` and `/i/:token` work without login through `security definer` RPCs; accepting a quote books the job | `get_public_quote`, `respond_to_quote`, `get_public_invoice` |
| Job photos live at `{business_id}/{job_id}/…`; storage access follows job visibility | storage policies |

## Payments and quotes

- **Payments:** each payment is a row in `payments`, and part-payments are supported. A trigger keeps `jobs.amount_paid` and `pay_state` in sync. A job becomes **Paid** once its payments cover the total, and goes back to **Done** if a payment is removed or extras push the total up.
- **Quotes:** statuses are **Draft → Sent → Accepted / Declined**. Sending a quote marks it Sent. When a customer accepts, a job is created (or the linked request is updated) in *Quote Sent*. It moves to *Job Scheduled* once the office clicks **Book job** and picks a date, time and crew.

## Demo data

`supabase/seed/demo_business.sql` creates **Coastal Lawn Co. (Demo)**, a Gold Coast lawn care business:
- 18 clients and 4 crew
- 41 jobs covering every status, including one with the timer running and one part-paid
- 17 payments and 7 quotes

Dates are set relative to the day you run it. It attaches to an existing owner, who then switches to it from the business switcher. Re-running it replaces the demo business.

```sql
-- in the SQL editor, run the whole file, then:
select pg_temp.seed_demo('<owner auth.users id>');
```

## App map

- **Auth:** `/login` (sign in / create account tabs), `/forgot`, `/reset`, `/join/:token`
- **Onboarding (owner, 4 steps):** trade → editable starter price list (`src/lib/starterPacks.ts`) → business details → crew and invites
- **Office:** `/` dashboard · `/jobs` (Active / Quotes / Requests / All / Completed, search, new job) · `/jobs/:id` · `/quotes/new`, `/quotes/:id` · `/schedule` · `/payments` · `/clients`, `/clients/:id` · `/crew`, `/crew/:id` · `/settings`
- **Crew:** `/field`, `/field/profile`, plus `/jobs/:id` and `/schedule` limited to their own jobs
- **Layout:** bottom tab bar under 768px, icon rail from 768–1199px, full sidebar at 1200px and up. Sheets are bottom sheets on phones and centred dialogs on larger screens.

## Tests

```bash
npm test          # unit tests: GST totals and en-AU formatting
npm run typecheck # also checks src/lib/types.ts against the generated schema types (src/lib/database.types.ts)
npm run test:db   # migration + RLS/flow assertions against a local Postgres
                  # (PGURL=postgres://postgres@localhost/postgres; Supabase auth/storage are stubbed)
```

`supabase/tests/rls_test.sql` checks the following:
- Tenants can't read or write each other's rows.
- Crew see only their assigned jobs and can't change prices or mark jobs paid.
- The public quote accept creates a booked job.
- The activity feed logs each step.
