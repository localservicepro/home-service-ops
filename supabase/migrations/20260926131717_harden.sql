-- Hardening from the Supabase advisors.
-- 1. Functions are EXECUTE-able by PUBLIC by default; lock them down to who actually needs them.
-- 2. Split "for all" write policies so each action has exactly one permissive policy.
-- 3. Evaluate auth.uid() once per statement, and index remaining foreign keys.

-- ── 1. Function privileges ──────────────────────────────────
-- Trigger functions: never called directly (EXECUTE is only checked at CREATE TRIGGER time).
revoke execute on function public.tg_set_total() from public, anon, authenticated;
revoke execute on function public.tg_job_num() from public, anon, authenticated;
revoke execute on function public.tg_quote_num() from public, anon, authenticated;
revoke execute on function public.tg_guard_crew_job_update() from public, anon, authenticated;
revoke execute on function public.tg_guard_business_update() from public, anon, authenticated;
revoke execute on function public.tg_job_activity() from public, anon, authenticated;
revoke execute on function public.tg_quote_activity() from public, anon, authenticated;

-- Internal helper used only inside the public RPCs.
revoke execute on function public.business_public_json(uuid) from public, anon, authenticated;

-- RLS helpers: needed by signed-in users (policies run as the caller), not by anon.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.member_role[]) from public, anon;
revoke execute on function public.is_office(uuid) from public, anon;
revoke execute on function public.my_staff_id(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function public.is_office(uuid) to authenticated;
grant execute on function public.my_staff_id(uuid) to authenticated;

-- Signed-in only RPCs.
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.create_business(text) from public, anon;
revoke execute on function public.set_my_duty(uuid, public.duty_status) from public, anon;

-- Intentionally public (token-addressed customer pages): get_invite, get_public_quote,
-- respond_to_quote, get_public_invoice — keep anon EXECUTE, drop the implicit PUBLIC grant.
revoke execute on function public.get_invite(text) from public;
revoke execute on function public.get_public_quote(text) from public;
revoke execute on function public.respond_to_quote(text, boolean, text, date) from public;
revoke execute on function public.get_public_invoice(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.respond_to_quote(text, boolean, text, date) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;

-- Utility functions used in column defaults / triggers.
revoke execute on function public.new_token() from anon;
revoke execute on function public.compute_total(jsonb, numeric, boolean) from anon;

-- ── 2. One permissive policy per action ─────────────────────
-- Policies apply to signed-in users only; anon has no table access at all.
do $$
declare t text;
begin
  foreach t in array array['staff', 'clients', 'services', 'addons', 'quotes'] loop
    execute format('drop policy if exists "office writes %s" on public.%I', t, t);
    execute format('create policy "office inserts %s" on public.%I for insert to authenticated with check (public.is_office(business_id))', t, t);
    execute format('create policy "office updates %s" on public.%I for update to authenticated using (public.is_office(business_id)) with check (public.is_office(business_id))', t, t);
    execute format('create policy "office deletes %s" on public.%I for delete to authenticated using (public.is_office(business_id))', t, t);
  end loop;
end $$;

-- jobs: merge office + crew into single SELECT / UPDATE policies.
drop policy "office reads jobs" on public.jobs;
drop policy "crew reads own jobs" on public.jobs;
drop policy "office updates jobs" on public.jobs;
drop policy "crew updates own jobs" on public.jobs;
create policy "members read visible jobs" on public.jobs for select to authenticated
  using (public.is_office(business_id) or (staff_id is not null and staff_id = public.my_staff_id(business_id)));
create policy "members update visible jobs" on public.jobs for update to authenticated
  using (public.is_office(business_id) or (staff_id is not null and staff_id = public.my_staff_id(business_id)))
  with check (public.is_office(business_id) or (staff_id is not null and staff_id = public.my_staff_id(business_id)));

-- ── 3. auth.uid() once per statement ────────────────────────
drop policy "members read team" on public.memberships;
create policy "members read team" on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_member(business_id));
drop policy "office removes non-owners" on public.memberships;
create policy "office removes non-owners" on public.memberships for delete to authenticated
  using (public.is_office(business_id) and role <> 'owner' and user_id <> (select auth.uid()));
drop policy "office creates invites" on public.invites;
create policy "office creates invites" on public.invites for insert to authenticated
  with check (public.is_office(business_id) and invited_by = (select auth.uid()));

-- ── Foreign-key indexes ─────────────────────────────────────
create index if not exists activity_job_id_idx on public.activity (job_id);
create index if not exists activity_quote_id_idx on public.activity (quote_id);
create index if not exists businesses_created_by_idx on public.businesses (created_by);
create index if not exists invites_accepted_by_idx on public.invites (accepted_by);
create index if not exists invites_invited_by_idx on public.invites (invited_by);
create index if not exists invites_staff_id_idx on public.invites (staff_id);
create index if not exists jobs_quote_id_idx on public.jobs (quote_id);
create index if not exists memberships_staff_id_idx on public.memberships (staff_id);
create index if not exists quotes_client_id_idx on public.quotes (client_id);
create index if not exists quotes_request_job_id_idx on public.quotes (request_job_id);
