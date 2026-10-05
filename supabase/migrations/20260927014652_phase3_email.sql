-- Phase 3: customer emails and password reset support.

-- Business is told once when a customer accepts or declines.
alter table public.quotes add column response_notified_at timestamptz;

-- Rate limiting for public email endpoints (password reset). Only the edge function (service role) can use it.
create table public.email_log (
  id bigint generated always as identity primary key,
  kind text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index email_log_kind_key_idx on public.email_log (kind, key, created_at desc);
alter table public.email_log enable row level security; -- no policies: invisible to anon/authenticated

create or replace function public.email_rate_ok(p_kind text, p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from email_log where created_at < now() - interval '1 day';
  select count(*) into n from email_log
  where kind = p_kind and key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then return false; end if;
  insert into email_log (kind, key) values (p_kind, p_key);
  return true;
end $$;
revoke execute on function public.email_rate_ok(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.email_rate_ok(text, text, integer, integer) to service_role;

