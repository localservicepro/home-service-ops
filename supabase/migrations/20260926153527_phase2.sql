-- Phase 2
-- 1. Crew only see their own staff record (no other staff's pay) and never read settings.
-- 2. LC- job numbers.
-- 3. Payment method "online" becomes "card".
-- 4. payments table (supports part-payments); jobs keep a cached pay_state / amount_paid.
-- 5. Quote statuses Draft, Sent, Accepted, Declined. Accepting a quote readies a job to book;
--    the office books it (date, time, crew) which moves it to Job Scheduled.

-- ── 1. Crew visibility ──────────────────────────────────────
drop policy "members read staff" on public.staff;
create policy "office reads staff, crew reads self" on public.staff for select to authenticated
  using (public.is_office(business_id) or id = public.my_staff_id(business_id));

drop policy "members read settings" on public.settings;
create policy "office reads settings" on public.settings for select to authenticated
  using (public.is_office(business_id));

-- ── 2. LC- job numbers ──────────────────────────────────────
create or replace function public.tg_job_num() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.num is null or new.num = '' then
    update businesses set next_job_num = next_job_num + 1 where id = new.business_id returning next_job_num - 1 into n;
    new.num := 'LC-' || n;
  end if;
  return new;
end $$;
update public.jobs set num = 'LC-' || substring(num from 3) where num like 'J-%';

-- ── 3. Card payments ────────────────────────────────────────
alter type public.pay_method rename value 'online' to 'card';
update public.settings
   set payment_methods = (select coalesce(jsonb_agg(case when v = 'online' then 'card' else v end), '[]'::jsonb)
                          from jsonb_array_elements_text(payment_methods) v);
alter table public.settings alter column payment_methods set default '["cash","bank","card"]'::jsonb;

-- ── 4. Payments ─────────────────────────────────────────────
alter table public.jobs add column amount_paid numeric(12,2) not null default 0;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.pay_method not null,
  paid_at timestamptz not null default now(),
  note text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_job_id_idx on public.payments (job_id);
create index payments_business_paid_at_idx on public.payments (business_id, paid_at desc);
create index payments_recorded_by_idx on public.payments (recorded_by);

-- Backfill from jobs already marked paid.
insert into public.payments (business_id, job_id, amount, method, paid_at, recorded_by)
select business_id, id, price, coalesce(pay_method, 'cash'), coalesce(paid_at, updated_at), null
from public.jobs where pay_state = 'paid' and price > 0;
update public.jobs set amount_paid = price where pay_state = 'paid';

alter table public.payments enable row level security;
create policy "office reads payments" on public.payments for select to authenticated using (public.is_office(business_id));
create policy "office records payments" on public.payments for insert to authenticated
  with check (public.is_office(business_id)
              and exists (select 1 from public.jobs j where j.id = job_id and j.business_id = payments.business_id));
create policy "office edits payments" on public.payments for update to authenticated
  using (public.is_office(business_id)) with check (public.is_office(business_id));
create policy "office deletes payments" on public.payments for delete to authenticated using (public.is_office(business_id));

-- Recompute a job's cached payment state from its payments.
create or replace function public.sync_job_payment(jid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs%rowtype; paid numeric; lm pay_method; lat timestamptz;
begin
  select * into j from jobs where id = jid;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into paid from payments where job_id = jid;
  select method, paid_at into lm, lat from payments where job_id = jid order by paid_at desc limit 1;
  if paid > 0 and paid >= j.price then
    update jobs set amount_paid = paid, pay_state = 'paid', pay_method = lm, paid_at = lat,
                    status = case when status = 'Cancelled' then status else 'Paid' end
    where id = jid;
  else
    update jobs set amount_paid = paid, pay_state = 'awaiting', pay_method = lm, paid_at = null,
                    status = case when status = 'Paid' then 'Done' else status end
    where id = jid;
  end if;
end $$;

create or replace function public.tg_payment_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare jid uuid := coalesce(new.job_id, old.job_id); j jobs%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into j from jobs where id = new.job_id;
    insert into activity (business_id, kind, message, job_id)
    values (new.business_id, 'payment',
            '$' || to_char(new.amount, 'FM999,999,990.00') || ' received from ' || coalesce(nullif(j.customer, ''), 'customer')
              || ' for ' || j.num || ' · ' || initcap(new.method::text), new.job_id);
  end if;
  perform public.sync_job_payment(jid);
  if tg_op = 'UPDATE' and old.job_id is distinct from new.job_id then
    perform public.sync_job_payment(old.job_id);
  end if;
  return null;
end $$;
create trigger payments_sync after insert or update or delete on public.payments
  for each row execute function public.tg_payment_sync();

-- If a paid job's total changes (extras added), recheck whether it's still fully paid.
create or replace function public.tg_job_price_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from payments where job_id = new.id) then
    perform public.sync_job_payment(new.id);
  end if;
  return null;
end $$;
create trigger jobs_price_sync after update on public.jobs
  for each row when (old.price is distinct from new.price) execute function public.tg_job_price_sync();

-- Crew guard now also protects amount_paid.
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
      new.client_id, new.pay_state, new.pay_method, new.paid_at, new.amount_paid, new.public_token,
      new.invoice_sent_at, new.source)
     is distinct from
     (old.business_id, old.num, old.customer, old.phone, old.email, old.address, old.service, old.line_items,
      old.price, old.gst, old.discount, old.scheduled_date, old.scheduled_time, old.frequency, old.staff_id,
      old.client_id, old.pay_state, old.pay_method, old.paid_at, old.amount_paid, old.public_token,
      old.invoice_sent_at, old.source)
  then
    raise exception 'Crew can only update status, notes, photos and the on-site timer';
  end if;
  return new;
end $$;

-- ── 5. Quote statuses ───────────────────────────────────────
alter type public.quote_status rename to quote_status_old;
create type public.quote_status as enum ('Draft', 'Sent', 'Accepted', 'Declined');
alter table public.quotes alter column status drop default;
alter table public.quotes alter column status type public.quote_status using (
  case status::text
    when 'Awaiting' then case when sent_at is null then 'Draft' else 'Sent' end
    when 'Converted' then 'Accepted'
    else status::text
  end)::public.quote_status;
alter table public.quotes alter column status set default 'Draft';
drop type public.quote_status_old;

-- Stamping sent_at (edge function or copy-link fallback) moves a draft to Sent.
create or replace function public.tg_quote_sent() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.sent_at is not null and new.status = 'Draft' then
    new.status := 'Sent';
  end if;
  return new;
end $$;
create trigger quotes_sent before insert or update on public.quotes
  for each row execute function public.tg_quote_sent();

create or replace function public.respond_to_quote(tok text, accept boolean, reason text default null, preferred_date date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quotes%rowtype; jid uuid; svc text;
begin
  select * into q from quotes where public_token = tok for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.status not in ('Draft', 'Sent') then raise exception 'This quote has already been %', lower(q.status::text); end if;

  if not accept then
    update quotes set status = 'Declined', decline_reason = nullif(trim(reason), ''), responded_at = now() where id = q.id;
    if q.request_job_id is not null then
      update jobs set status = 'Cancelled' where id = q.request_job_id and status in ('New', 'Quote Sent');
    end if;
    return jsonb_build_object('status', 'Declined');
  end if;

  select coalesce(string_agg(i->>'name', ' + '), 'Service') into svc
  from jsonb_array_elements(q.line_items) i where coalesce(i->>'kind', 'service') = 'service';

  -- The job waits in "Quote Sent" until the office books a date and crew.
  if q.request_job_id is not null then
    update jobs set line_items = q.line_items, gst = q.gst, discount = q.discount, service = coalesce(service, svc),
                    scheduled_date = coalesce(preferred_date, scheduled_date), quote_id = q.id,
                    status = case when status = 'New' then 'Quote Sent' else status end
    where id = q.request_job_id returning id into jid;
  end if;
  if jid is null then
    insert into jobs (business_id, status, customer, phone, email, address, service, line_items, gst, discount,
                      client_id, scheduled_date, notes, source, quote_id)
    values (q.business_id, 'Quote Sent', q.customer, q.phone, q.email, q.address, svc, q.line_items, q.gst, q.discount,
            q.client_id, preferred_date, q.note, 'quote', q.id)
    returning id into jid;
  end if;
  update quotes set status = 'Accepted', responded_at = now(), request_job_id = jid where id = q.id;
  return jsonb_build_object('status', 'Accepted');
end $$;

create or replace function public.tg_job_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity (business_id, kind, message, job_id)
    values (new.business_id,
            case when new.source = 'quote' then 'booked' when new.source <> 'manual' then 'request' else 'job_created' end,
            case when new.source = 'quote' then new.customer || ' accepted a quote — ' || new.num || ' is ready to book'
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

-- ── Grants for new functions ────────────────────────────────
revoke execute on function public.sync_job_payment(uuid) from public, anon, authenticated;
revoke execute on function public.tg_payment_sync() from public, anon, authenticated;
revoke execute on function public.tg_job_price_sync() from public, anon, authenticated;
revoke execute on function public.tg_quote_sent() from public, anon, authenticated;
revoke execute on function public.respond_to_quote(text, boolean, text, date) from public;
grant execute on function public.respond_to_quote(text, boolean, text, date) to anon, authenticated;
