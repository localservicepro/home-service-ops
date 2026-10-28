-- Supabase only (pg_cron isn't in the local stack): every 15 minutes, ask the api to send
-- whatever is due (job reminders, delayed review requests). The api checks the x-cron-key
-- header against the same Vault secret, so no key has to be copied into its settings.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hso_cron_key') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'hso_cron_key', 'Home Service Ops: key the api expects on /cron/tick');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'hso-tick';
select cron.schedule(
  'hso-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/cron/tick?forceFunctionRegion=ap-southeast-2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hso_cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
