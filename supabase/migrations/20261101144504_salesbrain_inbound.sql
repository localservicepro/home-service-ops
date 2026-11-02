-- Sales Brain creates accounts on a free included plan and ends that access
-- (POST /api/integrations/sales-brain, see helpers/salesBrainProvision.tsx).
alter table hso.businesses add column if not exists sales_brain_customer_id uuid;
create unique index if not exists businesses_sales_brain_customer_idx on hso.businesses (sales_brain_customer_id) where sales_brain_customer_id is not null;
alter table hso.businesses add column if not exists sales_brain_plan text;   -- their plan name in Sales Brain
alter table hso.businesses add column if not exists comp_ends_at timestamptz; -- free access stops at this time

-- Replaced by sales_brain_customer_id (never used: the earlier endpoint received no calls).
drop index if exists hso.businesses_sb_external_id_idx;
alter table hso.businesses drop column if exists sb_external_id;

-- Each event Sales Brain sends is processed once; a repeat gets the stored result.
create table if not exists hso.salesbrain_inbound (
  id text primary key,
  type text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table hso.salesbrain_inbound enable row level security;
