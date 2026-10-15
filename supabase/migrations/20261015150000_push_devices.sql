-- Push notifications (Android app via Firebase Cloud Messaging): one row per installed app.
create table if not exists hso.push_devices (
  id serial primary key,
  user_id int not null references hso.users (id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on hso.push_devices (user_id);
alter table hso.push_devices enable row level security;

-- Which alerts a person wants: { leads, quotes, payments, jobs } (missing = on).
alter table hso.users add column if not exists push_prefs jsonb not null default '{}';
