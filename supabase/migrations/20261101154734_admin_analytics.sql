-- Admin analytics: a ledger of app subscription payments, suspended accounts, demo data.

-- Every Home Service Ops payment (from Stripe invoice.paid / invoice.payment_failed / charge.refunded).
create table if not exists hso.billing_payments (
  id text primary key,                 -- Stripe invoice id, refund id, or demo-…
  business_id int not null references hso.businesses (id) on delete cascade,
  amount_cents int not null,           -- AUD, GST included; refunds are positive amounts
  status text not null,                -- paid | failed | refunded
  kind text not null,                  -- subscription | one_off | refund
  description text not null default '',
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists billing_payments_paid_idx on hso.billing_payments (paid_at desc);
create index if not exists billing_payments_business_idx on hso.billing_payments (business_id, paid_at desc);
alter table hso.billing_payments enable row level security;

-- Payments already sent to Sales Brain go in the ledger too.
insert into hso.billing_payments (id, business_id, amount_cents, status, kind, description, paid_at)
select distinct on (o.payload->'data'->>'payment_id')
       o.payload->'data'->>'payment_id',
       (o.payload->'data'->>'account_id')::int,
       (o.payload->'data'->>'amount_cents')::int,
       o.payload->'data'->>'status',
       o.payload->'data'->>'kind',
       coalesce(o.payload->'data'->>'description', ''),
       (o.payload->'data'->>'paid_at')::timestamptz
  from hso.salesbrain_outbox o
  join hso.businesses b on b.id = (o.payload->'data'->>'account_id')::int
 where o.type = 'payment.recorded'
 order by o.payload->'data'->>'payment_id', o.created_at desc
on conflict (id) do nothing;

-- Staff can suspend an account (nobody in it can use the app) without deleting it.
alter table hso.businesses add column if not exists suspended_at timestamptz;
alter table hso.businesses add column if not exists suspended_reason text;

-- Demo customers for exploring the admin (Admin → Demo data). Never sent to Sales Brain.
alter table hso.businesses add column if not exists is_demo boolean not null default false;
create index if not exists businesses_demo_idx on hso.businesses (id) where is_demo;
