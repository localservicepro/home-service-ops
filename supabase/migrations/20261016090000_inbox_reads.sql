-- Inbox: when someone in the business last read each conversation (shared team inbox).
create table if not exists hso.inbox_reads (
  business_id int not null references hso.businesses (id) on delete cascade,
  phone text not null,
  read_at timestamptz not null default now(),
  primary key (business_id, phone)
);
alter table hso.inbox_reads enable row level security;
