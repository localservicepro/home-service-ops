-- Sign-ins and active days per business, for the usage numbers sent to Sales Brain.
-- One row per Supabase Auth session the first time it's seen (a session = one sign-in), and one
-- row per member per Brisbane day they used the app. Support views by staff aren't recorded.
create table if not exists hso.account_sessions (
  session_id text primary key,
  business_id integer not null references hso.businesses(id) on delete cascade,
  user_id integer not null references hso.users(id) on delete cascade,
  first_seen_at timestamptz not null default now()
);
create index if not exists account_sessions_business_seen on hso.account_sessions (business_id, first_seen_at);

create table if not exists hso.account_activity (
  business_id integer not null references hso.businesses(id) on delete cascade,
  user_id integer not null references hso.users(id) on delete cascade,
  day date not null,
  primary key (business_id, user_id, day)
);
create index if not exists account_activity_business_day on hso.account_activity (business_id, day);

alter table hso.account_sessions enable row level security;
alter table hso.account_activity enable row level security;
