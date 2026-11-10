-- Google Business Profile, signed in with Google (OAuth, business.manage) instead of only picking
-- the listing from a Places search. With it the app reads every review, replies to them, shows
-- the profile's performance and posts updates.

-- Sign-in in progress (PKCE), like gcal_oauth_states.
create table if not exists hso.gbp_oauth_states (
  state text primary key,
  code_verifier text not null,
  redirect_uri text not null,
  business_id integer not null references hso.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table hso.gbp_oauth_states enable row level security;

-- The Google account a business signed in with. Kept apart from the chosen listing, so someone
-- managing several listings can sign in first and pick one after.
create table if not exists hso.gbp_google_auth (
  business_id integer primary key references hso.businesses(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  scopes text not null default '',
  connected_at timestamptz not null default now()
);
alter table hso.gbp_google_auth enable row level security;

-- The listing: which Google account/location it is when connected by sign-in ('google'), or
-- only the Places id when picked from search ('search').
alter table hso.gbp_connection
  add column if not exists source text not null default 'search' check (source in ('search', 'google')),
  add column if not exists account_name text,
  add column if not exists location_name text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists review_url text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_error text,
  add column if not exists insights jsonb,
  add column if not exists insights_at timestamptz;

-- Reviews read from Google (sign-in connections only; Places gives no full list).
create table if not exists hso.gbp_reviews (
  business_id integer not null references hso.businesses(id) on delete cascade,
  review_id text not null,
  stars smallint not null check (stars between 0 and 5),
  comment text not null default '',
  reviewer_name text not null default '',
  reviewer_photo text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  reply text,
  replied_at timestamptz,
  -- A client of this business with the same name, when there's exactly one.
  client_id integer references hso.clients(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  primary key (business_id, review_id)
);
create index if not exists gbp_reviews_recent_idx on hso.gbp_reviews (business_id, created_at desc);
alter table hso.gbp_reviews enable row level security;
