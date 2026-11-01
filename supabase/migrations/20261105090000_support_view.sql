-- "View as customer": staff open a business's account in the app with their own login, for a
-- limited time, read-only unless they allow changes. Every session and every change is kept.
create table if not exists hso.support_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id int not null references hso.users (id) on delete cascade,
  business_id int not null references hso.businesses (id) on delete cascade,
  reason text not null,
  allow_changes boolean not null default false,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  last_seen_at timestamptz
);
create index if not exists support_sessions_business_idx on hso.support_sessions (business_id, started_at desc);
create index if not exists support_sessions_staff_idx on hso.support_sessions (staff_id, started_at desc);
alter table hso.support_sessions enable row level security;

-- Changes made while viewing as a customer (method and path; no bodies).
create table if not exists hso.support_session_actions (
  id bigserial primary key,
  session_id uuid not null references hso.support_sessions (id) on delete cascade,
  method text not null,
  path text not null,
  at timestamptz not null default now()
);
create index if not exists support_session_actions_session_idx on hso.support_session_actions (session_id, at);
alter table hso.support_session_actions enable row level security;
