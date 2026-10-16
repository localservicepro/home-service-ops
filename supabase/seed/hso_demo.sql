-- Demo business for Home Service Ops: "Green Edge Lawn & Garden (Demo)", Gold Coast.
-- Attaches to an existing login (owner) by email. Dates are relative to today (Brisbane time).
-- Re-running replaces that owner's demo business. Usage: set the email on the line below, run all.
do $$
declare
  v_email text := 'support@localservicepro.com.au';
  v_user int;
  v_biz int;
  today date := (now() at time zone 'Australia/Brisbane')::date;
  s_mow int; s_hedge int; s_clean int; s_weed int; s_fert int; s_waste int;
  st int[] := '{}';
  cl int[] := '{}';
  q int;
  j int;
  i int;
  c record;
  -- clients: name, phone, email, address
  clients text[][] := array[
    ['Priya Sharma','0412 334 908','priya.sharma@example.com','12 Ocean Pde, Burleigh Heads'],
    ['Tom Kowalski','0433 120 556','tom.k@example.com','3 Hill St, Southport'],
    ['Chloe Barrett','0401 778 213','chloe.barrett@example.com','27 Albert Ave, Broadbeach'],
    ['Emma Rossi','0422 916 404','emma.rossi@example.com','8 Discovery Dr, Helensvale'],
    ['Janet Hollis','0415 640 117','janet.hollis@example.com','41 Hooker Blvd, Miami'],
    ['Oliver Grant','0438 552 091','oliver.grant@example.com','5 Sanctuary Cove Blvd, Hope Island'],
    ['Raymond Poole','0407 213 865','ray.poole@example.com','19 Gooding Dr, Merrimac'],
    ['Graham Whitfield','0429 330 744','g.whitfield@example.com','64 Bermuda St, Mermaid Waters'],
    ['Aisha Rahman','0416 802 551','aisha.rahman@example.com','2 Cottesloe Dr, Robina'],
    ['Daniel Ng','0431 448 026','daniel.ng@example.com','15 Pacific Pde, Currumbin'],
    ['Sophie Turner','0403 667 192','sophie.turner@example.com','9 Pappas Way, Carrara'],
    ['Mark Delaney','0419 225 380','mark.delaney@example.com','33 Gold Coast Hwy, Palm Beach'],
    ['Harbour View Body Corp','07 5531 2290','manager@harbourview.example.com','1 Marine Pde, Labrador'],
    ['Lucy Chen','0424 905 617','lucy.chen@example.com','22 Ashmore Rd, Benowa'],
    ['Ben Harper','0436 771 238','ben.harper@example.com','7 Reedy Creek Rd, Burleigh Waters'],
    ['Margaret Ellis','0408 553 902','m.ellis@example.com','48 Monaco St, Surfers Paradise']
  ];
begin
  select hu.id into v_user from hso.users hu join auth.users au on au.id = hu.auth_id where lower(au.email) = lower(v_email);
  if v_user is null then
    insert into hso.users (auth_id, email, display_name)
    select id, lower(email), coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'display_name', split_part(email, '@', 1))
    from auth.users where lower(email) = lower(v_email)
    returning id into v_user;
  end if;
  if v_user is null then raise exception 'No login found for %', v_email; end if;

  -- Replace an earlier demo business for this owner.
  delete from hso.businesses b using hso.memberships m
  where m.business_id = b.id and m.user_id = v_user and b.name like '%(Demo)';

  insert into hso.businesses (name, trade, plan, comp, onboarded_at, trial_ends_at)
  values ('Green Edge Lawn & Garden (Demo)', 'lawn', 'team', true, now(), now() + interval '14 days')
  returning id into v_biz;

  insert into hso.memberships (business_id, user_id, role) values (v_biz, v_user, 'owner');

  insert into hso.settings (business_id, owner, business, accept, bank_info, review_trigger, review_delay_minutes)
  values (v_biz,
    jsonb_build_object('first', 'Ryan', 'last', 'Mitchell', 'role', 'Owner', 'email', v_email, 'phone', '0412 345 678'),
    jsonb_build_object('name', 'Green Edge Lawn & Garden (Demo)', 'abn', '12 345 678 901', 'phone', '0412 345 678', 'email', v_email,
                       'address', '14 Industry Dr, Burleigh Heads QLD 4220', 'website', 'https://home.localservicepro.com.au', 'area', 'Gold Coast & Northern NSW'),
    '{"cash": true, "online": true, "bank": true}',
    jsonb_build_object('name', 'Green Edge Lawn & Garden', 'bank', 'Commonwealth Bank', 'bsb', '064-000', 'acct', '1234 5678'),
    'paid', 120);

  -- Services & add-ons
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Lawn mowing & edging', 65, 'Bi-weekly') returning id into s_mow;
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Hedge trimming', 120, 'One-time') returning id into s_hedge;
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Garden clean-up', 180, 'One-time') returning id into s_clean;
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Weeding & mulching', 150, 'One-time') returning id into s_weed;
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Lawn fertilising', 90, 'Seasonal') returning id into s_fert;
  insert into hso.services (business_id, name, price, freq) values (v_biz, 'Green waste removal', 80, 'One-time') returning id into s_waste;
  insert into hso.addons (business_id, name, price, service_ids) values
    (v_biz, 'Edging & whipper snip', 15, to_jsonb(array[s_mow])),
    (v_biz, 'Weed spray', 25, to_jsonb(array[s_mow, s_fert])),
    (v_biz, 'Extra trailer load', 60, to_jsonb(array[s_clean, s_waste]));

  -- Crew
  with ins as (
    insert into hso.staff (business_id, name, role, phone, color, rate, rate_type, duty) values
      (v_biz, 'Marcus Lee', 'Team leader', '0400 111 222', '#0C6FD0', 38, 'hour', 'On job'),
      (v_biz, 'Jess Taylor', 'Crew', '0400 333 444', '#2C9E73', 32, 'hour', 'Available'),
      (v_biz, 'Sam Patel', 'Crew', '0400 555 666', '#D98A1F', 55, 'job', 'Off today')
    returning id
  ) select array_agg(id order by id) into st from ins;

  -- Clients
  for i in 1 .. array_length(clients, 1) loop
    insert into hso.clients (business_id, name, phone, email, addresses)
    values (v_biz, clients[i][1], clients[i][2], clients[i][3], jsonb_build_array(clients[i][4]))
    returning id into j;
    cl := cl || j;
  end loop;

  -- Jobs: (client idx, service, base price, status, day offset, time, crew idx, pay method, source)
  for c in
    select * from (values
      -- paid, past weeks
      (1,'Lawn mowing & edging',65,'Paid',-27,'7:30 AM',1,'cash','quote'),
      (2,'Hedge trimming',120,'Paid',-25,'9:00 AM',2,'bank','manual'),
      (3,'Lawn mowing & edging',65,'Paid',-24,'8:00 AM',1,'online','manual'),
      (4,'Garden clean-up',180,'Paid',-20,'10:30 AM',3,'bank','quote'),
      (5,'Weeding & mulching',150,'Paid',-18,'1:00 PM',2,'cash','manual'),
      (6,'Lawn mowing & edging',65,'Paid',-13,'7:30 AM',1,'online','leadconnector'),
      (7,'Lawn fertilising',90,'Paid',-12,'9:00 AM',2,'bank','manual'),
      (8,'Green waste removal',80,'Paid',-10,'12:00 PM',3,'cash','manual'),
      (1,'Lawn mowing & edging',65,'Paid',-13,'7:30 AM',1,'cash','quote'),
      (13,'Garden clean-up',180,'Paid',-6,'8:00 AM',1,'bank','manual'),
      (9,'Hedge trimming',120,'Paid',-4,'10:30 AM',2,'online','website'),
      (10,'Lawn mowing & edging',65,'Paid',-3,'7:30 AM',1,'cash','manual'),
      -- done, awaiting payment
      (11,'Garden clean-up',180,'Done',-5,'9:00 AM',3,'bank','manual'),
      (12,'Lawn mowing & edging',65,'Done',-2,'7:30 AM',1,'online','manual'),
      (14,'Weeding & mulching',150,'Done',-1,'1:30 PM',2,'bank','quote'),
      -- today
      (3,'Lawn mowing & edging',65,'Done',0,'7:30 AM',1,null,'manual'),
      (5,'Hedge trimming',120,'In Progress',0,'10:30 AM',1,null,'manual'),
      (4,'Lawn mowing & edging',65,'Job Scheduled',0,'1:00 PM',2,null,'manual'),
      (15,'Green waste removal',80,'Job Scheduled',0,'3:00 PM',3,null,'website'),
      -- upcoming
      (1,'Lawn mowing & edging',65,'Job Scheduled',1,'7:30 AM',1,null,'quote'),
      (6,'Garden clean-up',180,'Job Scheduled',2,'9:00 AM',3,null,'leadconnector'),
      (7,'Lawn mowing & edging',65,'Job Scheduled',3,'8:00 AM',2,null,'manual'),
      (13,'Hedge trimming',120,'Job Scheduled',4,'10:30 AM',1,null,'manual'),
      (16,'Weeding & mulching',150,'Job Scheduled',6,'12:00 PM',2,null,'manual'),
      (8,'Lawn fertilising',90,'Job Scheduled',8,'7:30 AM',3,null,'manual'),
      (10,'Lawn mowing & edging',65,'Job Scheduled',11,'7:30 AM',1,null,'manual'),
      -- cancelled
      (12,'Hedge trimming',120,'Cancelled',-8,'9:00 AM',2,null,'manual')
    ) as t(ci, svc, base, status, d, tm, si, pm, src)
  loop
    insert into hso.jobs (business_id, client_id, staff_id, customer, phone, address, service, lines, gst, price, freq, status,
                          scheduled_date, scheduled_time, source, work_state, work_started_at, work_elapsed_ms,
                          pay_state, pay_method, invoice_sent_at, invoice_sent_to, status_changed_at, created_at)
    select v_biz, cl[c.ci], st[c.si], clients[c.ci][1], clients[c.ci][2], clients[c.ci][4], c.svc,
      jsonb_build_array(jsonb_build_object('id', 'l' || c.ci || c.d, 'kind', 'service', 'refId', null, 'parentId', null, 'name', c.svc, 'qty', 1, 'price', c.base)),
      true, round(c.base * 1.1, 2),
      case when c.svc = 'Lawn mowing & edging' then 'Bi-weekly' else 'One-time' end,
      c.status::hso.job_status,
      ((today + c.d)::timestamp at time zone 'UTC'), c.tm, c.src,
      case when c.status in ('Done','Paid') then 'done' when c.status = 'In Progress' then 'running' else 'idle' end::hso.work_state,
      case when c.status = 'In Progress' then now() - interval '42 minutes' end,
      case when c.status in ('Done','Paid') then (45 + (c.ci * 7) % 60) * 60000 else 0 end,
      case when c.status = 'Paid' then 'paid' when c.status = 'Done' and c.pm is not null then 'awaiting' end::hso.pay_state,
      case when c.status = 'Paid' or (c.status = 'Done' and c.pm is not null) then c.pm end::hso.pay_method,
      case when c.status = 'Paid' or (c.status = 'Done' and c.pm is not null) then (today + c.d)::timestamp at time zone 'Australia/Brisbane' + interval '17 hours' end,
      case when c.status = 'Paid' or (c.status = 'Done' and c.pm is not null) then clients[c.ci][3] end,
      now() + (least(c.d, 0) || ' days')::interval,
      now() + ((least(c.d, 0) - 3) || ' days')::interval;
  end loop;

  -- New requests (website form / LeadConnector), not yet quoted
  insert into hso.jobs (business_id, client_id, customer, phone, address, service, lines, price, status, source, notes, request_email, created_at) values
    (v_biz, cl[2], clients[2][1], clients[2][2], clients[2][4], 'Garden clean-up', '[]', 0, 'New', 'website', 'Backyard is overgrown after the rain. Side gate code 1234.', clients[2][3], now() - interval '3 hours'),
    (v_biz, cl[16], clients[16][1], clients[16][2], clients[16][4], 'Lawn mowing & edging', '[]', 0, 'New', 'leadconnector', 'New lead from LeadConnector (Google Ads).', clients[16][3], now() - interval '1 day'),
    (v_biz, cl[9], clients[9][1], clients[9][2], clients[9][4], 'Hedge trimming', '[]', 0, 'New', 'website', 'Two tall hedges along the driveway, about 15 m.', clients[9][3], now() - interval '2 days');

  -- Quotes
  insert into hso.quotes (business_id, client_id, customer, address, service, lines, gst, price, note, status, sent_at, sent_to, viewed_at, created_at) values
    (v_biz, cl[11], clients[11][1], clients[11][4], 'Garden clean-up, Green waste removal',
      jsonb_build_array(jsonb_build_object('id','a','kind','service','refId',s_clean,'parentId',null,'name','Garden clean-up','qty',1,'price',180),
                        jsonb_build_object('id','b','kind','service','refId',s_waste,'parentId',null,'name','Green waste removal','qty',1,'price',80)),
      true, 286, 'Includes two trailer loads of green waste.', 'Awaiting', now() - interval '1 day', clients[11][3], now() - interval '20 hours', now() - interval '1 day'),
    (v_biz, cl[14], clients[14][1], clients[14][4], 'Lawn mowing & edging',
      jsonb_build_array(jsonb_build_object('id','a','kind','service','refId',s_mow,'parentId',null,'name','Lawn mowing & edging','qty',1,'price',65),
                        jsonb_build_object('id','b','kind','addon','refId',null,'parentId','a','name','Weed spray','qty',1,'price',25)),
      true, 99, 'Fortnightly service, front and back.', 'Awaiting', now() - interval '3 days', clients[14][3], null, now() - interval '3 days'),
    (v_biz, cl[15], clients[15][1], clients[15][4], 'Weeding & mulching',
      jsonb_build_array(jsonb_build_object('id','a','kind','service','refId',s_weed,'parentId',null,'name','Weeding & mulching','qty',2,'price',150)),
      true, 330, '', 'Accepted', now() - interval '2 days', clients[15][3], now() - interval '2 days', now() - interval '2 days'),
    (v_biz, cl[12], clients[12][1], clients[12][4], 'Hedge trimming',
      jsonb_build_array(jsonb_build_object('id','a','kind','service','refId',s_hedge,'parentId',null,'name','Hedge trimming','qty',1,'price',120)),
      true, 132, '', 'Declined', now() - interval '9 days', clients[12][3], now() - interval '8 days', now() - interval '9 days');
  update hso.quotes set decline_reason = 'Going with a cheaper quote for now.' where business_id = v_biz and status = 'Declined';

  -- Converted quote linked to the upcoming job for client 1
  insert into hso.quotes (business_id, client_id, customer, address, service, lines, gst, price, status, sent_at, sent_to, viewed_at, job_num, created_at)
  select v_biz, cl[1], clients[1][1], clients[1][4], 'Lawn mowing & edging',
    jsonb_build_array(jsonb_build_object('id','a','kind','service','refId',s_mow,'parentId',null,'name','Lawn mowing & edging','qty',1,'price',65)),
    true, 71.5, 'Converted', now() - interval '30 days', clients[1][3], now() - interval '30 days',
    (select num from hso.jobs where business_id = v_biz and client_id = cl[1] and status = 'Job Scheduled' limit 1), now() - interval '30 days';

  -- Website enquiry form
  insert into hso.lead_forms (business_id, public_key, config, submissions, last_submission_at)
  values (v_biz, 'demo' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), '{}', 2, now() - interval '3 hours');

  raise notice 'Demo business % created for user %', v_biz, v_user;
end $$;
