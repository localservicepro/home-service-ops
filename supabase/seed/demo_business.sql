-- Demo business: "Coastal Lawn Co. (Demo)" — a Gold Coast lawn care outfit with realistic history.
-- Dates are relative to today, so the dashboard always has a live-looking day.
--
-- Usage (SQL editor or psql, run as one script):
--   \i supabase/seed/demo_business.sql
--   select pg_temp.seed_demo('<owner auth.users id>');
-- The owner gets the demo business in their business switcher; their other businesses are untouched.
-- Re-running replaces the previous demo business for that owner.
-- All people, phone numbers, emails, ABN and bank details are fictional.

create or replace function pg_temp.seed_demo(owner uuid) returns uuid
language plpgsql as $$
declare
  bid uuid;
  cl uuid[]; cn text[]; cp text[]; ce text[]; ca text[];
  st uuid[];
  sv uuid[]; svn text[]; svp numeric[];
  ad uuid[]; adn text[]; adp numeric[];
  r record; li jsonb; a int; d date; jid uuid; qid uuid; jprice numeric; at timestamptz; st_status public.job_status;
begin
  delete from public.businesses where created_by = owner and name = 'Coastal Lawn Co. (Demo)';

  insert into public.businesses (name, trade, onboarded_at, created_by)
  values ('Coastal Lawn Co. (Demo)', 'lawn', now() - interval '40 days', owner) returning id into bid;
  insert into public.memberships (user_id, business_id, role) values (owner, bid, 'owner');
  insert into public.settings (business_id, business_name, abn, phone, email, address, owner_name, owner_phone, owner_email,
                               payment_methods, bank_account_name, bank_bsb, bank_account_number, payment_terms_days)
  values (bid, 'Coastal Lawn Co. (Demo)', '12345678901', '0400 000 100', 'hello@coastallawn.example',
          '4 Ocean Pde, Coolangatta QLD 4225', 'Demo Owner', '0400 000 101', 'owner@coastallawn.example',
          '["cash","bank","card"]', 'Coastal Lawn Co Pty Ltd', '000-000', '12345678', 7);

  -- Price list (ex GST)
  with ins as (
    insert into public.services (business_id, name, price, frequency, sort)
    select bid, n, p, f, o::int from unnest(
      array['Lawn mow — small block', 'Lawn mow — standard block', 'Lawn mow — large block',
            'Hedge trimming (per hour)', 'Garden clean-up (per hour)', 'Fertilise & weed control'],
      array[55, 75, 110, 70, 65, 95]::numeric[],
      array['Fortnightly', 'Fortnightly', 'Fortnightly', 'One-off', 'One-off', 'Quarterly']) with ordinality as x(n, p, f, o)
    returning id, name, price, sort)
  select array_agg(id order by sort), array_agg(name order by sort), array_agg(price order by sort) into sv, svn, svp from ins;

  insert into public.addons (business_id, name, price, service_ids)
  select bid, n, p, case when o = 4 then sv[1:3] else '{}'::uuid[] end from unnest(
    array['Edging & whipper snip', 'Green waste removal', 'Blow down paths & driveway', 'Weed spray'],
    array[15, 35, 10, 25]::numeric[]) with ordinality as x(n, p, o);
  select array_agg(a.id order by x.o), array_agg(a.name order by x.o), array_agg(a.price order by x.o) into ad, adn, adp
  from unnest(array['Edging & whipper snip', 'Green waste removal', 'Blow down paths & driveway', 'Weed spray']) with ordinality as x(n, o)
  join public.addons a on a.business_id = bid and a.name = x.n;

  -- Crew
  with ins as (
    insert into public.staff (business_id, name, phone, email, role, colour, pay_rate, rate_type, duty)
    select bid, n, ph, em, rl, co, pr, rt::public.rate_type, du::public.duty_status from unnest(
      array['Marcus Lane', 'Priya Shah', 'Diego Ramos', 'Tanya Cole'],
      array['0400 000 201', '0400 000 202', '0400 000 203', '0400 000 204'],
      array['marcus@coastallawn.example', 'priya@coastallawn.example', 'diego@coastallawn.example', 'tanya@coastallawn.example'],
      array['Crew lead', 'Groundskeeper', 'Groundskeeper', 'Casual'],
      array['#0C6FD0', '#35C6F4', '#075BAF', '#2C9E73'],
      array[42, 38, 36, 55]::numeric[],
      array['hour', 'hour', 'hour', 'job'],
      array['On job', 'Available', 'Available', 'Off today']) with ordinality as x(n, ph, em, rl, co, pr, rt, du, o)
    returning id, name)
  select array_agg(i.id order by x.o) into st
  from ins i join unnest(array['Marcus Lane', 'Priya Shah', 'Diego Ramos', 'Tanya Cole']) with ordinality as x(n, o) on x.n = i.name;

  -- Clients
  select array_agg(n order by o), array_agg(p order by o), array_agg(e order by o), array_agg(ad1 order by o)
  into cn, cp, ce, ca
  from unnest(
    array['Sophie Nguyen', 'Daniel & Kate Morris', 'Raymond Poole', 'Aisha Rahman', 'Graham Whitfield', 'Chloe Barrett',
          'Tom Kowalski', 'Mia Castellano', 'Liam O''Connor', 'Janet Hollis', 'Hinterland Body Corporate', 'Priyanka Desai',
          'Ben Fraser', 'Emma Rossi', 'Oliver Grant', 'Hannah Lee', 'Jack Whitmore', 'Ruby Taylor'],
    array['0400 000 301', '0400 000 302', '0400 000 303', '0400 000 304', '0400 000 305', '0400 000 306',
          '0400 000 307', '0400 000 308', '0400 000 309', '0400 000 310', '0400 000 311', '0400 000 312',
          '0400 000 313', '0400 000 314', '0400 000 315', '0400 000 316', '0400 000 317', '0400 000 318'],
    array['sophie.nguyen@example.com', 'kate.morris@example.com', 'ray.poole@example.com', 'aisha.rahman@example.com',
          'graham.w@example.com', 'chloe.barrett@example.com', 'tom.kowalski@example.com', 'mia.castellano@example.com',
          'liam.oconnor@example.com', 'janet.hollis@example.com', 'manager@hinterlandbc.example', 'priyanka.desai@example.com',
          'ben.fraser@example.com', 'emma.rossi@example.com', 'oliver.grant@example.com', 'hannah.lee@example.com',
          'jack.whitmore@example.com', 'ruby.taylor@example.com'],
    array['14 Seabreeze Ave, Burleigh Heads QLD 4220', '7 Palm Grove Cres, Palm Beach QLD 4221', '61 Oakridge Dr, Robina QLD 4226',
          '22 Lakeview Pde, Varsity Lakes QLD 4227', '3 Heron Ct, Mermaid Waters QLD 4218', '118 Albert Ave, Broadbeach QLD 4218',
          '45 Scarborough St, Southport QLD 4215', '9 Duringan St, Currumbin QLD 4223', '30 Toolona St, Tugun QLD 4224',
          '5 Marine Pde, Miami QLD 4220', '200 Nerang Broadbeach Rd, Nerang QLD 4211', '17 Pacific Dr, Elanora QLD 4221',
          '88 Marine Pde, Coolangatta QLD 4225', '26 Discovery Dr, Helensvale QLD 4212', '4 Sanctuary Cove Blvd, Hope Island QLD 4212',
          '51 Bermuda St, Mermaid Waters QLD 4218', '12 Christine Ave, Burleigh Waters QLD 4220', '8 Pine Ridge Rd, Coombabah QLD 4216'])
    with ordinality as x(n, p, e, ad1, o);

  with ins as (
    insert into public.clients (business_id, name, phone, email, addresses, notes, created_at)
    select bid, cn[i], cp[i], ce[i],
           case when i = 10 then jsonb_build_array(jsonb_build_object('label', 'Home', 'line', ca[i]),
                                                   jsonb_build_object('label', 'Rental', 'line', '12 Bayview St, Miami QLD 4220'))
                else jsonb_build_array(jsonb_build_object('label', case when i = 11 then 'Common areas' else 'Home' end, 'line', ca[i])) end,
           case i when 2 then 'Side gate code 4471. Friendly kelpie.' when 11 then 'Invoice the strata manager, PO required.' else null end,
           now() - make_interval(days => 60 - i)
    from generate_series(1, 18) i
    returning id, name)
  select array_agg(ins.id order by array_position(cn, ins.name)) into cl from ins;

  -- Jobs: (client, service, qty, add-ons, day offset, time, crew, outcome, minutes on site, pay method, frequency, notes)
  for r in
    select * from (values
      (1, 2, 1, '{1,2}'::int[], -33, '08:00', 1, 'paid', 55, 'bank', 'Fortnightly', null::text),
      (2, 1, 1, '{1}', -32, '09:30', 2, 'paid', 35, 'cash', 'Fortnightly', 'Side gate code 4471'),
      (3, 3, 1, '{1,2,3}', -31, '07:30', 1, 'paid', 80, 'card', 'Fortnightly', null),
      (4, 6, 1, '{}', -29, '10:00', 3, 'paid', 40, 'bank', 'Quarterly', null),
      (5, 4, 3, '{2}', -27, '08:30', 1, 'paid', 170, 'bank', 'One-off', 'Hedges along back fence, take green waste'),
      (6, 2, 1, '{1}', -26, '13:00', 2, 'paid', 45, 'cash', 'Weekly', null),
      (1, 2, 1, '{1,2}', -19, '08:00', 1, 'paid', 50, 'bank', 'Fortnightly', null),
      (2, 1, 1, '{1}', -18, '09:30', 2, 'paid', 30, 'cash', 'Fortnightly', 'Side gate code 4471'),
      (7, 5, 4, '{2}', -17, '08:00', 3, 'paid', 230, 'card', 'One-off', 'Overgrown garden beds, pre-sale clean-up'),
      (3, 3, 1, '{1,2,3}', -17, '12:30', 1, 'paid', 75, 'card', 'Fortnightly', null),
      (8, 2, 1, '{1,4}', -15, '09:00', 4, 'paid', 55, 'cash', 'One-off', null),
      (9, 1, 1, '{}', -13, '14:00', 2, 'cancel', 0, null, 'One-off', 'Customer away — will rebook'),
      (6, 2, 1, '{1}', -12, '13:00', 2, 'paid', 40, 'cash', 'Weekly', null),
      (10, 3, 1, '{1,2}', -10, '07:30', 1, 'paid', 95, 'bank', 'Monthly', 'Do the rental at 12 Bayview St next visit'),
      (11, 6, 1, '{4}', -8, '10:30', 3, 'owing', 45, null, 'Quarterly', 'Common areas + entry gardens'),
      (6, 2, 1, '{1}', -5, '13:00', 2, 'paid', 42, 'cash', 'Weekly', null),
      (1, 2, 1, '{1,2}', -5, '08:00', 1, 'part', 52, 'bank', 'Fortnightly', null),
      (2, 1, 1, '{1}', -4, '09:30', 2, 'done', 32, null, 'Fortnightly', 'Side gate code 4471'),
      (3, 3, 1, '{1,2,3}', -3, '07:30', 1, 'paid', 78, 'card', 'Fortnightly', null),
      (12, 4, 2, '{2}', -3, '11:00', 3, 'owing', 120, null, 'One-off', null),
      (13, 2, 1, '{1}', -1, '09:00', 4, 'owing', 48, null, 'One-off', null),
      (6, 2, 1, '{1}', 0, '07:30', 2, 'paid', 41, 'cash', 'Weekly', null),
      (14, 3, 1, '{1,2}', 0, '08:00', 1, 'done', 85, null, 'Fortnightly', null),
      (10, 5, 2, '{2}', 0, '10:30', 1, 'running', 40, null, 'One-off', 'Clear lantana along north fence'),
      (15, 1, 1, '{1,3}', 0, '13:00', 3, 'sched', 0, null, 'Fortnightly', null),
      (4, 2, 1, '{1}', 0, '14:30', 2, 'sched', 0, null, 'Fortnightly', null),
      (8, 3, 1, '{1,2}', 1, '08:30', 1, 'sched', 0, null, 'Monthly', null),
      (6, 2, 1, '{1}', 2, '13:00', 2, 'sched', 0, null, 'Weekly', null),
      (11, 6, 1, '{}', 4, '10:00', 3, 'sched_q', 0, null, 'One-off', 'Booked from accepted quote'),
      (5, 4, 2, '{2}', 6, '09:00', 3, 'sched', 0, null, 'One-off', null),
      (1, 2, 1, '{1,2}', 9, '08:00', 1, 'sched', 0, null, 'Fortnightly', null),
      (6, 2, 1, '{1}', 9, '13:00', 2, 'sched', 0, null, 'Weekly', null),
      (2, 1, 1, '{1}', 10, '09:30', 2, 'sched', 0, null, 'Fortnightly', 'Side gate code 4471'),
      (3, 3, 1, '{1,2,3}', 11, '07:30', 1, 'sched', 0, null, 'Fortnightly', null),
      (14, 3, 1, '{1,2}', 14, '08:00', 1, 'sched', 0, null, 'Fortnightly', null),
      (16, 5, 3, '{2}', null, null, 0, 'new', 0, null, 'One-off', 'Wants the whole backyard tidied before Christmas'),
      (17, 3, 1, '{}', null, null, 0, 'new', 0, null, 'Fortnightly', 'Asked for a fortnightly price'),
      (18, 6, 1, '{}', null, null, 0, 'new', 0, null, 'Quarterly', null),
      (7, 4, 2, '{2}', null, null, 0, 'quote', 0, null, 'One-off', 'Front hedge + side screen'),
      (9, 2, 1, '{1,4}', null, null, 0, 'quote', 0, null, 'Fortnightly', 'Rebook after cancelled visit'),
      (12, 6, 1, '{4}', 3, null, 0, 'accepted', 0, null, 'Quarterly', null)
    ) as v(c, s, qty, adds, day, tm, crew, outcome, mins, method, freq, note)
    order by v.day nulls last, v.tm
  loop
    li := jsonb_build_array(jsonb_build_object('id', left(md5(random()::text), 8), 'name', svn[r.s], 'qty', r.qty,
                                               'unit_price', svp[r.s], 'kind', 'service', 'ref_id', sv[r.s]));
    foreach a in array r.adds loop
      li := li || jsonb_build_object('id', left(md5(random()::text), 8), 'name', adn[a], 'qty', 1,
                                     'unit_price', adp[a], 'kind', 'addon', 'ref_id', ad[a]);
    end loop;
    d := case when r.day is null then null else current_date + r.day end;
    at := coalesce(d::timestamp + coalesce(r.tm, '09:00')::time, now());
    st_status := case r.outcome
      when 'paid' then 'Done' when 'done' then 'Done' when 'owing' then 'Done' when 'part' then 'Done'
      when 'cancel' then 'Cancelled' when 'running' then 'In Progress'
      when 'sched' then 'Job Scheduled' when 'sched_q' then 'Job Scheduled'
      when 'new' then 'New' else 'Quote Sent' end;

    insert into public.jobs (business_id, status, customer, phone, email, address, service, line_items, gst,
                             scheduled_date, scheduled_time, frequency, staff_id, client_id, notes,
                             work_state, work_started_at, work_elapsed_ms, invoice_sent_at, source, created_at)
    values (bid, st_status, cn[r.c], cp[r.c], ce[r.c], ca[r.c], svn[r.s], li, true,
            case when r.outcome in ('new', 'quote') then null else d end, r.tm::time, r.freq,
            case when r.crew > 0 then st[r.crew] end, cl[r.c], r.note,
            case when r.outcome in ('paid', 'done', 'owing', 'part') then 'done'::public.work_state
                 when r.outcome = 'running' then 'running' else 'idle' end,
            case when r.outcome = 'running' then now() - make_interval(mins => r.mins) end,
            case when r.outcome in ('paid', 'done', 'owing', 'part') then r.mins * 60000 else 0 end,
            case when r.outcome in ('owing', 'part') or (r.outcome = 'paid' and r.method = 'bank') then least(at + interval '3 hours', now()) end,
            case when r.outcome in ('new', 'quote') then 'website' when r.outcome in ('sched_q', 'accepted') then 'quote' else 'manual' end,
            least(coalesce(d, current_date)::timestamp - interval '4 days' + interval '9 hours', now() - interval '2 hours'))
    returning id, price into jid, jprice;

    if r.outcome in ('paid', 'part') then
      insert into public.payments (business_id, job_id, amount, method, paid_at, recorded_by)
      values (bid, jid, case when r.outcome = 'part' then round(jprice / 2, 0) else jprice end, r.method::public.pay_method,
              least(at + make_interval(mins => r.mins + 20) + case when r.method = 'bank' then interval '2 days' else interval '0' end, now()),
              owner);
    end if;

    if r.outcome in ('quote', 'accepted', 'sched_q') then
      insert into public.quotes (business_id, status, customer, phone, email, address, client_id, line_items, gst, note,
                                 sent_at, viewed_at, responded_at, request_job_id, created_at)
      values (bid, case when r.outcome = 'quote' then 'Sent' else 'Accepted' end::public.quote_status,
              cn[r.c], cp[r.c], ce[r.c], ca[r.c], cl[r.c], li, true,
              'Thanks for the enquiry! Price includes all green waste removal.',
              now() - interval '3 days', case when r.c = 7 then null else now() - interval '2 days' end,
              case when r.outcome = 'accepted' then now() - interval '50 minutes'
                   when r.outcome = 'sched_q' then now() - interval '6 days' end,
              jid, now() - interval '4 days')
      returning id into qid;
      update public.jobs set quote_id = qid where id = jid;
      if r.outcome <> 'quote' then
        insert into public.activity (business_id, kind, message, quote_id, created_at)
        select bid, 'quote_accepted', cn[r.c] || ' accepted quote ' || q.num, qid,
               case when r.outcome = 'accepted' then now() - interval '50 minutes' else now() - interval '6 days' end
        from public.quotes q where q.id = qid;
      end if;
    end if;
  end loop;

  -- Stand-alone quotes: two drafts and a decline.
  insert into public.quotes (business_id, status, customer, phone, email, address, client_id, line_items, gst, discount, note, created_at)
  values
    (bid, 'Draft', cn[13], cp[13], ce[13], ca[13], cl[13],
     jsonb_build_array(jsonb_build_object('id', 'd1a', 'name', svn[4], 'qty', 3, 'unit_price', svp[4], 'kind', 'service', 'ref_id', sv[4]),
                       jsonb_build_object('id', 'd1b', 'name', adn[2], 'qty', 1, 'unit_price', adp[2], 'kind', 'addon', 'ref_id', ad[2])),
     true, 0, null, now() - interval '1 day'),
    (bid, 'Draft', cn[15], cp[15], ce[15], ca[15], cl[15],
     jsonb_build_array(jsonb_build_object('id', 'd2a', 'name', svn[5], 'qty', 5, 'unit_price', svp[5], 'kind', 'service', 'ref_id', sv[5]),
                       jsonb_build_object('id', 'd2b', 'name', 'Mulch supply & spread (m³)', 'qty', 2, 'unit_price', 85, 'kind', 'extra')),
     true, 25, 'Returning customer discount applied.', now() - interval '5 hours');
  insert into public.quotes (business_id, status, customer, phone, email, address, client_id, line_items, gst, sent_at, viewed_at,
                             responded_at, decline_reason, created_at)
  values (bid, 'Declined', cn[5], cp[5], ce[5], ca[5], cl[5],
          jsonb_build_array(jsonb_build_object('id', 'd3a', 'name', svn[6], 'qty', 1, 'unit_price', svp[6], 'kind', 'service', 'ref_id', sv[6])),
          true, now() - interval '9 days', now() - interval '8 days', now() - interval '7 days',
          'Going with a cheaper quote for now', now() - interval '10 days')
  returning id into qid;
  insert into public.activity (business_id, kind, message, quote_id, created_at)
  select bid, 'quote_declined', cn[5] || ' declined quote ' || q.num || ' — "Going with a cheaper quote for now"', qid, now() - interval '7 days'
  from public.quotes q where q.id = qid;

  -- Put trigger-generated activity at realistic times.
  update public.activity a set created_at = least(case
      when a.kind in ('job_created', 'request', 'booked') then j.created_at
      when a.kind = 'payment' then coalesce((select max(p.paid_at) from public.payments p where p.job_id = j.id), j.created_at)
      when a.message like '%→ Paid' then coalesce(j.paid_at, j.created_at)
      when a.message like '%→ Done' then coalesce(j.scheduled_date + j.scheduled_time + make_interval(secs => j.work_elapsed_ms / 1000), j.created_at)
      else coalesce(j.scheduled_date + j.scheduled_time, j.created_at) end, now())
  from public.jobs j
  where a.job_id = j.id and a.business_id = bid and a.quote_id is null;

  return bid;
end $$;
