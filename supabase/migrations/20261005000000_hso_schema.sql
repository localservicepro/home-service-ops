-- Home Service Ops: the app's data model, in its own schema (hso) next to the old public tables.
-- Accounts live in Supabase Auth (auth.users); hso.users holds the app profile, keyed by auth_id.
-- These tables are only reached through the `api` Edge Function (direct Postgres connection).
-- RLS is on with no policies and the API roles have no grants, so PostgREST can't read them.

create schema if not exists hso;

do $$ begin
  create type hso.duty_status as enum ('Available', 'Off today', 'On job');
  create type hso.job_status as enum ('Cancelled', 'Done', 'In Progress', 'Job Scheduled', 'New', 'Paid', 'Quote Sent');
  create type hso.member_role as enum ('admin', 'crew', 'owner');
  create type hso.pay_method as enum ('bank', 'cash', 'online');
  create type hso.pay_state as enum ('awaiting', 'paid');
  create type hso.quote_status as enum ('Accepted', 'Awaiting', 'Converted', 'Declined');
  create type hso.rate_type as enum ('hour', 'job');
  create type hso.user_role as enum ('admin', 'user');
  create type hso.work_state as enum ('done', 'idle', 'running');
exception when duplicate_object then null; end $$;

create or replace function hso.new_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- ── Accounts ────────────────────────────────────────────────
create table hso.users (
  id serial primary key,
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  role hso.user_role not null default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index users_email_lower on hso.users (lower(email));

create table hso.businesses (
  id serial primary key,
  name text not null,
  trade text not null default '',
  plan text not null default 'trial',
  comp boolean not null default false,
  trial_ends_at timestamptz default (now() + interval '14 days'),
  onboarded_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table hso.staff (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  name text not null,
  role text not null default 'Crew',
  phone text not null default '',
  color text not null default '#0C6FD0',
  rate numeric(10, 2) not null default 0,
  rate_type hso.rate_type not null default 'hour',
  rating text not null default '',
  duty hso.duty_status not null default 'Available',
  created_at timestamptz not null default now()
);
create index on hso.staff (business_id);

create table hso.memberships (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  user_id int not null references hso.users (id) on delete cascade,
  role hso.member_role not null,
  staff_id int references hso.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index on hso.memberships (user_id);

create table hso.invites (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  token text not null unique default hso.new_token(),
  email text not null default '',
  role hso.member_role not null,
  staff_id int references hso.staff (id) on delete set null,
  invited_by int references hso.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id int references hso.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on hso.invites (business_id);

create table hso.settings (
  business_id int primary key references hso.businesses (id) on delete cascade,
  owner jsonb not null default '{}',
  business jsonb not null default '{}',
  accept jsonb not null default '{"cash": true, "online": true, "bank": true}',
  bank_info jsonb not null default '{}',
  card_provider text not null default 'stripe',
  direct_debit boolean not null default false,
  review_requests_enabled boolean not null default false,
  review_trigger text not null default 'paid',
  review_delay_minutes int not null default 120,
  review_message text,
  review_enabled_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ── Catalogue, clients, quotes, jobs ────────────────────────
create table hso.services (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  freq text not null default 'One-time',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on hso.services (business_id);

create table hso.addons (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  service_ids jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index on hso.addons (business_id);

create table hso.clients (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  addresses jsonb not null default '[]',
  review_opt_out boolean not null default false,
  review_token text unique,
  lc_contact_id text,
  xero_contact_id text,
  gc_customer_id text,
  gc_mandate_id text,
  gc_mandate_status text,
  created_at timestamptz not null default now()
);
create index on hso.clients (business_id);

create table hso.quotes (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  num text not null default '',
  client_id int references hso.clients (id) on delete set null,
  customer text not null,
  address text not null default '',
  service text not null default '',
  lines jsonb not null default '[]',
  discount numeric(10, 2) not null default 0,
  gst boolean not null default true,
  price numeric(10, 2) not null default 0,
  note text not null default '',
  status hso.quote_status not null default 'Awaiting',
  status_changed_at timestamptz not null default now(),
  public_token text not null unique default hso.new_token(),
  sent_at timestamptz,
  sent_to text,
  viewed_at timestamptz,
  decline_reason text,
  request_job_id int,
  job_num text,
  lc_opportunity_id text,
  created_at timestamptz not null default now()
);
create index on hso.quotes (business_id);

create table hso.jobs (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  num text not null default '',
  client_id int references hso.clients (id) on delete set null,
  quote_id int references hso.quotes (id) on delete set null,
  staff_id int references hso.staff (id) on delete set null,
  customer text not null,
  phone text not null default '',
  address text not null default '',
  service text not null default '',
  lines jsonb not null default '[]',
  discount numeric(10, 2) not null default 0,
  gst boolean not null default true,
  price numeric(10, 2) not null default 0,
  freq text not null default 'One-time',
  notes text not null default '',
  photos jsonb not null default '[]',
  source text not null default 'manual',
  request_email text,
  status hso.job_status not null default 'New',
  status_changed_at timestamptz not null default now(),
  scheduled_date timestamptz,
  scheduled_time text not null default '',
  work_state hso.work_state not null default 'idle',
  work_started_at timestamptz,
  work_elapsed_ms double precision not null default 0,
  crew_pay numeric(10, 2),
  crew_pay_type hso.rate_type,
  pay_state hso.pay_state,
  pay_method hso.pay_method,
  pay_provider text,
  public_token text not null unique default hso.new_token(),
  invoice_sent_at timestamptz,
  invoice_sent_to text,
  invoice_viewed_at timestamptz,
  stripe_link_id text,
  stripe_link_url text,
  stripe_link_amount numeric(10, 2),
  stripe_session_id text,
  square_link_id text,
  square_link_url text,
  square_link_amount numeric(10, 2),
  square_order_id text,
  gc_billing_request_id text,
  gc_flow_url text,
  gc_payment_id text,
  gc_payment_status text,
  gc_amount numeric(10, 2),
  xero_invoice_id text,
  xero_payment_id text,
  xero_status text,
  xero_online_url text,
  xero_error text,
  xero_attempts int not null default 0,
  xero_synced_at timestamptz,
  gcal_event_id text,
  lc_contact_id text,
  lc_opportunity_id text,
  review_requested_at timestamptz,
  review_status text,
  created_at timestamptz not null default now()
);
create index on hso.jobs (business_id, status);
create index on hso.jobs (business_id, scheduled_date);
create index on hso.jobs (staff_id);
alter table hso.quotes add constraint quotes_request_job_fk foreign key (request_job_id) references hso.jobs (id) on delete set null;

-- Per-business numbering: jobs LC-1001…, quotes Q-2001…
create table hso.counters (
  business_id int not null references hso.businesses (id) on delete cascade,
  kind text not null,
  last int not null,
  primary key (business_id, kind)
);

create or replace function hso.next_num(p_business int, p_kind text, p_start int) returns int
language sql volatile as $$
  insert into hso.counters as c (business_id, kind, last) values (p_business, p_kind, p_start)
  on conflict (business_id, kind) do update set last = c.last + 1
  returning last
$$;

create or replace function hso.tg_job_num() returns trigger language plpgsql as $$
begin
  if new.num is null or new.num = '' then new.num := 'LC-' || hso.next_num(new.business_id, 'job', 1001); end if;
  return new;
end $$;
create trigger job_num before insert on hso.jobs for each row execute function hso.tg_job_num();

create or replace function hso.tg_quote_num() returns trigger language plpgsql as $$
begin
  if new.num is null or new.num = '' then new.num := 'Q-' || hso.next_num(new.business_id, 'quote', 2001); end if;
  return new;
end $$;
create trigger quote_num before insert on hso.quotes for each row execute function hso.tg_quote_num();

-- ── Website enquiry form ────────────────────────────────────
create table hso.lead_forms (
  business_id int primary key references hso.businesses (id) on delete cascade,
  public_key text not null unique,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  notify_email boolean not null default true,
  submissions int not null default 0,
  last_submission_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hso.lead_form_hits (
  id bigserial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  ip_hash text not null,
  kind text not null default 'submit',
  created_at timestamptz not null default now()
);
create index on hso.lead_form_hits (business_id, ip_hash, kind, created_at);

-- ── Integrations (one connection per business) ──────────────
create table hso.stripe_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  account_id text not null,
  account_name text not null default '',
  currency text not null default 'aud',
  livemode boolean not null default false,
  connected_at timestamptz not null default now()
);
create table hso.stripe_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create table hso.square_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  merchant_id text not null,
  merchant_name text not null default '',
  location_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  currency text not null default 'AUD',
  livemode boolean not null default false,
  connected_at timestamptz not null default now()
);
create table hso.square_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table hso.gocardless_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  organisation_id text not null,
  access_token text not null,
  creditor_name text not null default '',
  email text not null default '',
  livemode boolean not null default false,
  connected_at timestamptz not null default now()
);
create table hso.gocardless_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create table hso.xero_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  tenant_id text not null,
  connection_id text,
  org_name text not null default '',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  auto_sync boolean not null default true,
  invoice_mode text not null default 'invoice',
  email_invoices boolean not null default false,
  sales_account_code text,
  bank_account_id text,
  bank_account_name text,
  mode_changed_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now()
);
create table hso.xero_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table hso.lc_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  location_id text not null,
  location_name text not null default '',
  company_id text,
  user_id text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  scopes text not null default '',
  redirect_uri text not null,
  pipeline_id text,
  stage_map jsonb not null default '{}',
  push_new boolean not null default true,
  import_leads boolean not null default true,
  import_after timestamptz,
  last_import_at timestamptz,
  last_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now()
);
create table hso.lc_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);
create table hso.lc_opportunities (
  business_id int not null references hso.businesses (id) on delete cascade,
  opportunity_id text not null,
  contact_id text,
  stage_key text not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, opportunity_id)
);

create table hso.gcal_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text not null,
  access_expires_at timestamptz,
  scopes text not null default '',
  time_zone text not null default 'Australia/Sydney',
  last_synced_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now()
);
create table hso.gcal_oauth_states (
  state text primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  code_verifier text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create table hso.gbp_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  place_id text not null,
  name text not null,
  address text not null default '',
  maps_url text,
  rating numeric(3, 2),
  review_count int not null default 0,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);

-- ── Lock it down: no PostgREST access ───────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'hso' loop
    execute format('alter table hso.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on schema hso from public;
do $$ begin
  revoke all on schema hso from anon, authenticated;
exception when undefined_object then null; end $$;

-- ── Storage: public bucket for job photos, form logos and lead photos ──
-- Uploads go through signed upload URLs issued by the api function.
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hso-public', 'hso-public', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'image/svg+xml'])
  on conflict (id) do nothing;
exception when undefined_table then null; end $$;

-- Password-reset emails sent, for rate limiting (5 per address per hour).
create table hso.auth_email_log (
  id bigserial primary key,
  email text not null,
  kind text not null default 'recovery',
  created_at timestamptz not null default now()
);
create index on hso.auth_email_log (email, created_at);
alter table hso.auth_email_log enable row level security;
