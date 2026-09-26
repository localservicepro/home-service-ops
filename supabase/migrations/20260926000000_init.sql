-- Home Service Ops — core schema
-- Multi-tenant: every business-owned row carries business_id and is guarded by RLS.
-- Money is AUD, stored as numeric(12,2). Line item prices are GST-exclusive; `price` is the final total.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
create type public.member_role as enum ('owner', 'admin', 'crew');
create type public.job_status as enum ('New', 'Quote Sent', 'Job Scheduled', 'In Progress', 'Done', 'Paid', 'Cancelled');
create type public.quote_status as enum ('Awaiting', 'Accepted', 'Declined', 'Converted');
create type public.work_state as enum ('idle', 'running', 'done');
create type public.pay_state as enum ('awaiting', 'paid');
create type public.pay_method as enum ('cash', 'bank', 'online');
create type public.rate_type as enum ('hour', 'job');
create type public.duty_status as enum ('Available', 'On job', 'Off today');

create or replace function public.new_token() returns text
language sql volatile as $$
  select encode(gen_random_bytes(18), 'hex')
$$;

-- ─────────────────────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────────────────────
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My business',
  trade text,
  plan text not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  onboarded_at timestamptz,
  next_job_num integer not null default 1001,
  next_quote_num integer not null default 501,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  role text not null default 'Crew',
  colour text not null default '#0C6FD0',
  pay_rate numeric(10,2) not null default 0,
  rate_type public.rate_type not null default 'hour',
  duty public.duty_status not null default 'Available',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.staff (business_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  role public.member_role not null,
  staff_id uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);
create index on public.memberships (business_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  role public.member_role not null check (role in ('admin', 'crew')),
  staff_id uuid references public.staff (id) on delete set null,
  token text not null unique default public.new_token(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invites (business_id);

-- ─────────────────────────────────────────────────────────────
-- Business data
-- ─────────────────────────────────────────────────────────────
create table public.settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  business_name text,
  abn text,
  phone text,
  email text,
  address text,
  logo_url text,
  owner_name text,
  owner_phone text,
  owner_email text,
  payment_methods jsonb not null default '["cash","bank","online"]'::jsonb,
  bank_account_name text,
  bank_bsb text,
  bank_account_number text,
  payment_terms_days integer not null default 7,
  online_payment_url text,
  integrations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  addresses jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.clients (business_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  frequency text not null default 'One-off',
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.services (business_id);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  service_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.addons (business_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  num text not null,
  status public.job_status not null default 'New',
  customer text not null default '',
  phone text,
  email text,
  address text,
  service text,
  line_items jsonb not null default '[]'::jsonb,
  price numeric(12,2) not null default 0,
  gst boolean not null default true,
  discount numeric(12,2) not null default 0,
  scheduled_date date,
  scheduled_time time,
  frequency text not null default 'One-off',
  staff_id uuid references public.staff (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  notes text,
  photos jsonb not null default '[]'::jsonb,
  work_state public.work_state not null default 'idle',
  work_started_at timestamptz,
  work_elapsed_ms bigint not null default 0,
  pay_state public.pay_state not null default 'awaiting',
  pay_method public.pay_method,
  paid_at timestamptz,
  public_token text not null unique default public.new_token(),
  invoice_sent_at timestamptz,
  source text not null default 'manual',
  quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, num)
);
create index on public.jobs (business_id, status);
create index on public.jobs (business_id, scheduled_date);
create index on public.jobs (staff_id);
create index on public.jobs (client_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  num text not null,
  status public.quote_status not null default 'Awaiting',
  customer text not null default '',
  phone text,
  email text,
  address text,
  client_id uuid references public.clients (id) on delete set null,
  line_items jsonb not null default '[]'::jsonb,
  price numeric(12,2) not null default 0,
  gst boolean not null default true,
  discount numeric(12,2) not null default 0,
  note text,
  valid_until date default (current_date + 30),
  public_token text not null unique default public.new_token(),
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  request_job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, num)
);
create index on public.quotes (business_id, status);
alter table public.jobs add constraint jobs_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete set null;

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null,
  message text not null,
  job_id uuid references public.jobs (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.activity (business_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Membership helpers (security definer so policies don't recurse)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where business_id = bid and user_id = auth.uid())
$$;

create or replace function public.has_role(bid uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where business_id = bid and user_id = auth.uid() and role = any (roles))
$$;

create or replace function public.is_office(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(bid, array['owner', 'admin']::public.member_role[])
$$;

create or replace function public.my_staff_id(bid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select staff_id from memberships where business_id = bid and user_id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────
-- Totals: line items are GST-exclusive. total = (sub - discount) * 1.1 when gst.
-- ─────────────────────────────────────────────────────────────
create or replace function public.compute_total(items jsonb, disc numeric, with_gst boolean) returns numeric
language sql immutable as $$
  with sub as (
    select coalesce(sum(coalesce((i->>'qty')::numeric, 1) * coalesce((i->>'unit_price')::numeric, 0)), 0) as s
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) i
  )
  select round(greatest(s - coalesce(disc, 0), 0) * case when with_gst then 1.1 else 1 end, 2) from sub
$$;

create or replace function public.tg_set_total() returns trigger
language plpgsql as $$
begin
  if jsonb_array_length(coalesce(new.line_items, '[]'::jsonb)) > 0 then
    new.price := public.compute_total(new.line_items, new.discount, new.gst);
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger jobs_total before insert or update on public.jobs for each row execute function public.tg_set_total();
create trigger quotes_total before insert or update on public.quotes for each row execute function public.tg_set_total();

-- Per-business numbering: J-1001, Q-501 …
create or replace function public.tg_job_num() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.num is null or new.num = '' then
    update businesses set next_job_num = next_job_num + 1 where id = new.business_id returning next_job_num - 1 into n;
    new.num := 'J-' || n;
  end if;
  return new;
end $$;

create or replace function public.tg_quote_num() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.num is null or new.num = '' then
    update businesses set next_quote_num = next_quote_num + 1 where id = new.business_id returning next_quote_num - 1 into n;
    new.num := 'Q-' || n;
  end if;
  return new;
end $$;

alter table public.jobs alter column num set default '';
alter table public.quotes alter column num set default '';
create trigger jobs_num before insert on public.jobs for each row execute function public.tg_job_num();
create trigger quotes_num before insert on public.quotes for each row execute function public.tg_quote_num();

-- Crew may only touch the on-site fields of jobs assigned to them.
create or replace function public.tg_guard_crew_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_office(old.business_id) then
    return new;
  end if;
  if new.status is distinct from old.status and new.status not in ('In Progress', 'Done') then
    raise exception 'Crew can only mark jobs In Progress or Done';
  end if;
  if (new.business_id, new.num, new.customer, new.phone, new.email, new.address, new.service, new.line_items,
      new.price, new.gst, new.discount, new.scheduled_date, new.scheduled_time, new.frequency, new.staff_id,
      new.client_id, new.pay_state, new.pay_method, new.paid_at, new.public_token, new.invoice_sent_at, new.source)
     is distinct from
     (old.business_id, old.num, old.customer, old.phone, old.email, old.address, old.service, old.line_items,
      old.price, old.gst, old.discount, old.scheduled_date, old.scheduled_time, old.frequency, old.staff_id,
      old.client_id, old.pay_state, old.pay_method, old.paid_at, old.public_token, old.invoice_sent_at, old.source)
  then
    raise exception 'Crew can only update status, notes, photos and the on-site timer';
  end if;
  return new;
end $$;
create trigger jobs_guard_crew before update on public.jobs for each row execute function public.tg_guard_crew_job_update();

-- Plan / trial / numbering are managed by the platform, not by tenants.
create or replace function public.tg_guard_business_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (new.plan, new.trial_ends_at, new.created_by)
     is distinct from (old.plan, old.trial_ends_at, old.created_by) then
    raise exception 'Plan and billing fields can only be changed by Local Service Pro';
  end if;
  return new;
end $$;
create trigger businesses_guard before update on public.businesses for each row execute function public.tg_guard_business_update();

-- ─────────────────────────────────────────────────────────────
-- Activity feed
-- ─────────────────────────────────────────────────────────────
create or replace function public.tg_job_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity (business_id, kind, message, job_id)
    values (new.business_id,
            case when new.source = 'quote' then 'booked' when new.source <> 'manual' then 'request' else 'job_created' end,
            case when new.source = 'quote' then new.customer || ' accepted a quote — ' || new.num || ' booked'
                 when new.source <> 'manual' then 'New request from ' || coalesce(nullif(new.customer, ''), 'a customer')
                 else new.num || ' created for ' || coalesce(nullif(new.customer, ''), 'a customer') end,
            new.id);
  elsif new.status is distinct from old.status then
    insert into activity (business_id, kind, message, job_id)
    values (new.business_id, 'status', new.num || ' · ' || coalesce(nullif(new.customer, ''), 'Job') || ' → ' || new.status::text, new.id);
  elsif new.invoice_sent_at is distinct from old.invoice_sent_at and new.invoice_sent_at is not null then
    insert into activity (business_id, kind, message, job_id)
    values (new.business_id, 'invoice', 'Invoice sent to ' || coalesce(nullif(new.customer, ''), 'customer') || ' for ' || new.num, new.id);
  end if;
  return new;
end $$;
create trigger jobs_activity after insert or update on public.jobs for each row execute function public.tg_job_activity();

create or replace function public.tg_quote_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.sent_at is distinct from old.sent_at and new.sent_at is not null then
      insert into activity (business_id, kind, message, quote_id) values (new.business_id, 'quote_sent', 'Quote ' || new.num || ' sent to ' || new.customer, new.id);
    end if;
    if new.viewed_at is distinct from old.viewed_at and old.viewed_at is null then
      insert into activity (business_id, kind, message, quote_id) values (new.business_id, 'quote_viewed', new.customer || ' viewed quote ' || new.num, new.id);
    end if;
    if new.status is distinct from old.status and new.status in ('Accepted', 'Declined') then
      insert into activity (business_id, kind, message, quote_id)
      values (new.business_id, 'quote_' || lower(new.status::text), new.customer || ' ' || lower(new.status::text) || ' quote ' || new.num
              || coalesce(' — "' || nullif(new.decline_reason, '') || '"', ''), new.id);
    end if;
  end if;
  return new;
end $$;
create trigger quotes_activity after update on public.quotes for each row execute function public.tg_quote_activity();

-- ─────────────────────────────────────────────────────────────
-- Signup: every signup creates a business (owner) unless it carries a valid invite token.
-- ─────────────────────────────────────────────────────────────
create or replace function public.accept_invite_for(uid uuid, uemail text, tok text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  select * into inv from invites where token = tok for update;
  if not found then raise exception 'Invite not found'; end if;
  if inv.accepted_at is not null then raise exception 'Invite already used'; end if;
  if inv.expires_at < now() then raise exception 'Invite has expired'; end if;
  if lower(inv.email) <> lower(coalesce(uemail, '')) then
    raise exception 'This invite was sent to %', inv.email;
  end if;
  insert into memberships (user_id, business_id, role, staff_id)
  values (uid, inv.business_id, inv.role, inv.staff_id)
  on conflict (user_id, business_id) do update set role = excluded.role, staff_id = coalesce(excluded.staff_id, memberships.staff_id);
  update invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.business_id;
end $$;

create or replace function public.create_business_for(uid uuid, bname text, uname text, uemail text) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  insert into businesses (name, created_by) values (coalesce(nullif(bname, ''), 'My business'), uid) returning id into bid;
  insert into memberships (user_id, business_id, role) values (uid, bid, 'owner');
  insert into settings (business_id, business_name, owner_name, owner_email, email)
  values (bid, coalesce(nullif(bname, ''), 'My business'), uname, uemail, uemail);
  return bid;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare tok text := new.raw_user_meta_data->>'invite_token';
begin
  if tok is not null and exists (select 1 from invites where token = tok and accepted_at is null and expires_at > now()
                                  and lower(email) = lower(new.email)) then
    perform public.accept_invite_for(new.id, new.email, tok);
  else
    perform public.create_business_for(new.id, new.raw_user_meta_data->>'business_name',
                                       new.raw_user_meta_data->>'full_name', new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Signed-in user accepting an invite from /join/:token
create or replace function public.accept_invite(tok text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return public.accept_invite_for(auth.uid(), auth.jwt()->>'email', tok);
end $$;

-- Invite preview for the /join page (no login needed)
create or replace function public.get_invite(tok text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', i.email, 'role', i.role, 'expired', i.expires_at < now(), 'accepted', i.accepted_at is not null,
    'business_name', coalesce(s.business_name, b.name), 'logo_url', s.logo_url,
    'staff_name', st.name)
  from invites i
  join businesses b on b.id = i.business_id
  left join settings s on s.business_id = i.business_id
  left join staff st on st.id = i.staff_id
  where i.token = tok
$$;

-- Additional business for an existing user (business switcher → "New business")
create or replace function public.create_business(bname text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return public.create_business_for(auth.uid(), bname, null, auth.jwt()->>'email');
end $$;

-- Crew can set their own duty without write access to the staff table
create or replace function public.set_my_duty(bid uuid, d public.duty_status) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_staff_id(bid);
begin
  if sid is null then raise exception 'No crew profile linked to your login'; end if;
  update staff set duty = d where id = sid and business_id = bid;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Public (no login) quote + invoice endpoints, addressed by unguessable token
-- ─────────────────────────────────────────────────────────────
create or replace function public.business_public_json(bid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', coalesce(s.business_name, b.name), 'abn', s.abn, 'phone', s.phone, 'email', s.email,
    'address', s.address, 'logo_url', s.logo_url, 'payment_methods', s.payment_methods,
    'bank_account_name', s.bank_account_name, 'bank_bsb', s.bank_bsb, 'bank_account_number', s.bank_account_number,
    'payment_terms_days', s.payment_terms_days, 'online_payment_url', s.online_payment_url)
  from businesses b left join settings s on s.business_id = b.id where b.id = bid
$$;

create or replace function public.get_public_quote(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quotes%rowtype;
begin
  select * into q from quotes where public_token = tok;
  if not found then return null; end if;
  if q.viewed_at is null then
    update quotes set viewed_at = now() where id = q.id;
  end if;
  return jsonb_build_object(
    'num', q.num, 'status', q.status, 'customer', q.customer, 'address', q.address,
    'line_items', q.line_items, 'price', q.price, 'gst', q.gst, 'discount', q.discount, 'note', q.note,
    'valid_until', q.valid_until, 'sent_at', q.sent_at, 'created_at', q.created_at,
    'decline_reason', q.decline_reason, 'responded_at', q.responded_at,
    'business', public.business_public_json(q.business_id));
end $$;

create or replace function public.respond_to_quote(tok text, accept boolean, reason text default null, preferred_date date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quotes%rowtype; jid uuid; svc text;
begin
  select * into q from quotes where public_token = tok for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.status <> 'Awaiting' then raise exception 'This quote has already been %', lower(q.status::text); end if;

  if not accept then
    update quotes set status = 'Declined', decline_reason = nullif(trim(reason), ''), responded_at = now() where id = q.id;
    if q.request_job_id is not null then
      update jobs set status = 'Cancelled' where id = q.request_job_id and status in ('New', 'Quote Sent');
    end if;
    return jsonb_build_object('status', 'Declined');
  end if;

  select coalesce(string_agg(i->>'name', ' + '), 'Service') into svc
  from jsonb_array_elements(q.line_items) i where coalesce(i->>'kind', 'service') = 'service';

  if q.request_job_id is not null then
    update jobs set status = 'Job Scheduled', line_items = q.line_items, gst = q.gst, discount = q.discount,
                    service = coalesce(service, svc), scheduled_date = coalesce(preferred_date, scheduled_date), quote_id = q.id
    where id = q.request_job_id returning id into jid;
  end if;
  if jid is null then
    insert into jobs (business_id, status, customer, phone, email, address, service, line_items, gst, discount,
                      client_id, scheduled_date, notes, source, quote_id)
    values (q.business_id, 'Job Scheduled', q.customer, q.phone, q.email, q.address, svc, q.line_items, q.gst, q.discount,
            q.client_id, preferred_date, q.note, 'quote', q.id)
    returning id into jid;
  end if;
  update quotes set status = 'Accepted', responded_at = now(), request_job_id = jid where id = q.id;
  return jsonb_build_object('status', 'Accepted');
end $$;

create or replace function public.get_public_invoice(tok text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'num', j.num, 'status', j.status, 'customer', j.customer, 'address', j.address, 'service', j.service,
    'line_items', j.line_items, 'price', j.price, 'gst', j.gst, 'discount', j.discount,
    'scheduled_date', j.scheduled_date, 'invoice_sent_at', j.invoice_sent_at, 'created_at', j.created_at,
    'pay_state', j.pay_state, 'pay_method', j.pay_method, 'paid_at', j.paid_at,
    'business', public.business_public_json(j.business_id))
  from jobs j where j.public_token = tok
$$;

-- ─────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────
alter table public.businesses  enable row level security;
alter table public.memberships enable row level security;
alter table public.invites     enable row level security;
alter table public.settings    enable row level security;
alter table public.staff       enable row level security;
alter table public.clients     enable row level security;
alter table public.services    enable row level security;
alter table public.addons      enable row level security;
alter table public.jobs        enable row level security;
alter table public.quotes      enable row level security;
alter table public.activity    enable row level security;

-- businesses
create policy "members read business"  on public.businesses for select using (public.is_member(id));
create policy "office updates business" on public.businesses for update using (public.is_office(id)) with check (public.is_office(id));

-- memberships: everyone in the business sees the team; owner manages; nobody edits the owner row except the owner
create policy "members read team" on public.memberships for select using (user_id = auth.uid() or public.is_member(business_id));
create policy "owner updates team" on public.memberships for update
  using (public.has_role(business_id, array['owner']::public.member_role[]) and role <> 'owner')
  with check (public.has_role(business_id, array['owner']::public.member_role[]) and role <> 'owner');
create policy "office removes non-owners" on public.memberships for delete
  using (public.is_office(business_id) and role <> 'owner' and user_id <> auth.uid());

-- invites
create policy "office reads invites"   on public.invites for select using (public.is_office(business_id));
create policy "office creates invites" on public.invites for insert with check (public.is_office(business_id) and invited_by = auth.uid());
create policy "office updates invites" on public.invites for update using (public.is_office(business_id)) with check (public.is_office(business_id));
create policy "office deletes invites" on public.invites for delete using (public.is_office(business_id));

-- settings
create policy "members read settings"   on public.settings for select using (public.is_member(business_id));
create policy "office writes settings"  on public.settings for update using (public.is_office(business_id)) with check (public.is_office(business_id));
create policy "office inserts settings" on public.settings for insert with check (public.is_office(business_id));

-- staff, clients, services, addons: office read/write; crew read staff/services/addons
create policy "members read staff" on public.staff for select using (public.is_member(business_id));
create policy "office writes staff" on public.staff for all using (public.is_office(business_id)) with check (public.is_office(business_id));

create policy "office reads clients"  on public.clients for select using (public.is_office(business_id));
create policy "office writes clients" on public.clients for all using (public.is_office(business_id)) with check (public.is_office(business_id));

create policy "members read services" on public.services for select using (public.is_member(business_id));
create policy "office writes services" on public.services for all using (public.is_office(business_id)) with check (public.is_office(business_id));

create policy "members read addons" on public.addons for select using (public.is_member(business_id));
create policy "office writes addons" on public.addons for all using (public.is_office(business_id)) with check (public.is_office(business_id));

-- jobs: office sees all; crew only jobs assigned to their staff record
create policy "office reads jobs" on public.jobs for select using (public.is_office(business_id));
create policy "crew reads own jobs" on public.jobs for select
  using (staff_id is not null and staff_id = public.my_staff_id(business_id));
create policy "office inserts jobs" on public.jobs for insert with check (public.is_office(business_id));
create policy "office updates jobs" on public.jobs for update using (public.is_office(business_id)) with check (public.is_office(business_id));
create policy "crew updates own jobs" on public.jobs for update
  using (staff_id is not null and staff_id = public.my_staff_id(business_id))
  with check (staff_id is not null and staff_id = public.my_staff_id(business_id));
create policy "office deletes jobs" on public.jobs for delete using (public.is_office(business_id));

-- quotes: office only
create policy "office reads quotes"  on public.quotes for select using (public.is_office(business_id));
create policy "office writes quotes" on public.quotes for all using (public.is_office(business_id)) with check (public.is_office(business_id));

-- activity: office reads (written by triggers)
create policy "office reads activity" on public.activity for select using (public.is_office(business_id));

-- ─────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────
revoke execute on function public.accept_invite_for(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.create_business_for(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.respond_to_quote(text, boolean, text, date) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_business(text) to authenticated;
grant execute on function public.set_my_duty(uuid, public.duty_status) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Storage: job photos (private, {business_id}/{job_id}/file) and logos (public, {business_id}/file)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;

-- Job photo access follows job visibility: the subquery runs under the caller's RLS on jobs.
create policy "job photos read" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and exists (
    select 1 from public.jobs j where j.id::text = (storage.foldername(name))[2] and j.business_id::text = (storage.foldername(name))[1]));
create policy "job photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and exists (
    select 1 from public.jobs j where j.id::text = (storage.foldername(name))[2] and j.business_id::text = (storage.foldername(name))[1]));
create policy "job photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and exists (
    select 1 from public.jobs j where j.id::text = (storage.foldername(name))[2] and j.business_id::text = (storage.foldername(name))[1]));

create policy "logos read" on storage.objects for select using (bucket_id = 'logos');
create policy "logos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_office(((storage.foldername(name))[1])::uuid));
create policy "logos update" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_office(((storage.foldername(name))[1])::uuid));
create policy "logos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_office(((storage.foldername(name))[1])::uuid));
