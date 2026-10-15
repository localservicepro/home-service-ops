-- SMS through myCRMSIM: one connection per business, installs waiting to be linked, and a send log.
create table if not exists hso.sms_connection (
  business_id int primary key references hso.businesses (id) on delete cascade,
  provider text not null default 'mycrmsim',
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  scopes text not null default '',
  installer_name text,
  installer_email text,
  workspace_id bigint,
  workspace_name text,
  prefs jsonb not null default '{}',
  last_error text,
  last_sent_at timestamptz,
  connected_at timestamptz not null default now()
);
create table if not exists hso.sms_pending_installs (
  id text primary key,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  scopes text not null default '',
  installer_name text,
  installer_email text,
  created_at timestamptz not null default now()
);
create table if not exists hso.sms_log (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  kind text not null,
  to_phone text not null,
  job_id int references hso.jobs (id) on delete set null,
  quote_id int references hso.quotes (id) on delete set null,
  message_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists sms_log_business_idx on hso.sms_log (business_id, created_at desc);
alter table hso.quotes add column if not exists sms_sent_at timestamptz;
alter table hso.quotes add column if not exists sms_sent_to text;
alter table hso.jobs add column if not exists invoice_sms_at timestamptz;
alter table hso.jobs add column if not exists invoice_sms_to text;
alter table hso.sms_connection enable row level security;
alter table hso.sms_pending_installs enable row level security;
alter table hso.sms_log enable row level security;
