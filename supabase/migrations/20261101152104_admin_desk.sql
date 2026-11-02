-- Staff admin (/admin): ticket assignment and internal notes, first response time, notes on customers.
alter table hso.support_tickets add column if not exists assigned_to int references hso.users (id) on delete set null;
alter table hso.support_tickets add column if not exists first_response_at timestamptz;
create index if not exists support_tickets_assigned_idx on hso.support_tickets (assigned_to, status);
alter table hso.support_messages add column if not exists internal boolean not null default false; -- staff-only note, never shown to the customer
update hso.support_tickets t set first_response_at = (
  select min(m.created_at) from hso.support_messages m where m.ticket_id = t.id and m.from_staff
) where first_response_at is null;

create table if not exists hso.customer_notes (
  id serial primary key,
  business_id int not null references hso.businesses (id) on delete cascade,
  author_id int references hso.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists customer_notes_business_idx on hso.customer_notes (business_id, created_at desc);
alter table hso.customer_notes enable row level security;
