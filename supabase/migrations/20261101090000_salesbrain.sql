-- Sales Brain integration: an outbox of events pushed to Sales Brain (see helpers/salesBrain.tsx),
-- support tickets, and the account fields Sales Brain reports on.

create table if not exists hso.salesbrain_outbox (
  id text primary key,                       -- the event id sent to Sales Brain (stable across retries)
  type text not null,                        -- account.upserted | payment.recorded | ticket.upserted
  payload jsonb not null,                    -- the whole event: { id, type, occurred_at, data }
  status text not null default 'pending',    -- pending | sent | rejected | held
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  send_alone boolean not null default false, -- a batch was refused (400): send this one on its own
  alerted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists salesbrain_outbox_due_idx on hso.salesbrain_outbox (next_attempt_at) where status = 'pending';
alter table hso.salesbrain_outbox enable row level security;

-- What Sales Brain needs about each account.
alter table hso.businesses add column if not exists cancelled_at timestamptz;
alter table hso.businesses add column if not exists cancel_reason text;
alter table hso.businesses add column if not exists last_active_at timestamptz;
alter table hso.businesses add column if not exists last_invoice_cents int;  -- last regular subscription charge, GST incl.
alter table hso.businesses add column if not exists sb_fingerprint text;     -- last account state queued for Sales Brain

-- Support tickets (Settings → Help & support; staff answer in /admin).
create table if not exists hso.support_tickets (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  created_by int references hso.users (id) on delete set null,
  subject text not null,
  body text not null default '',
  status text not null default 'open',       -- open | pending | solved | closed
  priority text not null default 'normal',   -- low | normal | high | urgent
  category text not null default 'other',
  last_message text,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  solved_at timestamptz
);
create index if not exists support_tickets_business_idx on hso.support_tickets (business_id, updated_at desc);
create index if not exists support_tickets_status_idx on hso.support_tickets (status, updated_at desc);
alter table hso.support_tickets enable row level security;

create table if not exists hso.support_messages (
  id serial primary key,
  ticket_id int not null references hso.support_tickets (id) on delete cascade,
  author_id int references hso.users (id) on delete set null,
  from_staff boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on hso.support_messages (ticket_id, created_at);
alter table hso.support_messages enable row level security;

-- Local Service Pro staff (the /admin page) are users with role 'admin'.
update hso.users set role = 'admin' where lower(email) in ('info@localservicepro.com.au', 'support@localservicepro.com.au');
