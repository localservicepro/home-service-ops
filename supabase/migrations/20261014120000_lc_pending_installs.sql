-- LeadConnector installs started from the marketplace (no state): tokens wait here
-- until a signed-in owner or admin claims them for their business.
create table if not exists hso.lc_pending_installs (
  id text primary key,
  location_id text not null,
  location_name text not null default '',
  company_id text,
  user_id text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  scopes text not null default '',
  redirect_uri text not null,
  created_at timestamptz not null default now()
);
alter table hso.lc_pending_installs enable row level security;
