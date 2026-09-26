\set ON_ERROR_STOP 1
-- Assumes a fresh database with 00_local_stubs.sql + migrations applied (see run.sh).
-- signups
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','alice@a.com','{"business_name":"Alice Lawns","full_name":"Alice"}'),
 ('00000000-0000-0000-0000-00000000000b','bob@b.com','{"business_name":"Bob Clean"}');
select b.name, m.role from memberships m join businesses b on b.id=m.business_id order by 1;

-- as alice: create staff, invite crew, jobs
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claim.email = 'alice@a.com';
select id as bid_a from businesses \gset
insert into staff (business_id,name,email) values (:'bid_a','Marcus','marcus@a.com') returning id as sid \gset
insert into invites (business_id,email,role,staff_id,invited_by) values (:'bid_a','Marcus@a.com','crew',:'sid',auth.uid()) returning token as tok \gset
insert into jobs (business_id,customer,staff_id,line_items,discount) values (:'bid_a','Nina',:'sid','[{"name":"Mow","qty":1,"unit_price":100},{"name":"Edge","qty":2,"unit_price":10}]',20) returning num, price;
insert into jobs (business_id,customer) values (:'bid_a','Unassigned Ursula') returning num;
insert into quotes (business_id,customer,line_items) values (:'bid_a','Quinn','[{"name":"Hedge","qty":1,"unit_price":200,"kind":"service"}]') returning num, price, public_token as qtok \gset
select count(*) as alice_jobs from jobs;
reset role;

-- crew signup with invite token
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000c','marcus@a.com', jsonb_build_object('invite_token', :'tok'));
select role, staff_id is not null as linked from memberships where user_id='00000000-0000-0000-0000-00000000000c';
select count(*) as biz_count from businesses;

-- as crew
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set request.jwt.claim.email = 'marcus@a.com';
select customer as crew_sees from jobs;
select count(*) as crew_quotes from quotes;
select count(*) as crew_clients from clients;
update jobs set work_state='running', status='In Progress', work_started_at=now() where customer='Nina';
-- expected failures: crew can't touch price or mark jobs paid
do $$ begin
  begin update jobs set price = 1 where customer = 'Nina'; raise exception 'FAIL: crew changed price';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update jobs set status = 'Paid' where customer = 'Nina'; raise exception 'FAIL: crew marked paid';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_my_duty(:'bid_a','On job');
reset role;

-- owner can't self-upgrade the plan
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
set request.jwt.claim.email = 'alice@a.com';
do $$ begin
  begin update businesses set plan = 'fleet'; raise exception 'FAIL: plan changed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
update businesses set name = 'Alice Lawns Co';
reset role;

-- as bob: sees nothing of Alice
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claim.email = 'bob@b.com';
select (select count(*) from jobs) bob_jobs, (select count(*) from staff) bob_staff, (select count(*) from businesses) bob_biz, (select count(*) from quotes) bob_quotes;
update jobs set price = 0; -- should touch 0 rows
-- expected failure: cross-tenant insert is blocked by RLS
select set_config('test.bid_a', :'bid_a', false);
do $$ begin
  begin insert into jobs (business_id, customer) values (current_setting('test.bid_a')::uuid, 'hack'); raise exception 'FAIL: cross-tenant insert';
  exception when insufficient_privilege then null; end;
end $$;
select case when (select count(*) from jobs) = 0 then 'ok' else 'FAIL' end as bob_isolated;
reset role;

-- anon: public quote flow
set role anon;
reset request.jwt.claim.sub;
select get_public_quote(:'qtok')->>'num' as pub_quote, get_public_quote(:'qtok')->'business'->>'name' as biz;
select count(*) as anon_jobs from jobs;
select respond_to_quote(:'qtok', true, null, '2026-10-01');
reset role;
select num, status, source, scheduled_date, price from jobs order by num;
select kind, message from activity order by created_at;
select duty from staff;
