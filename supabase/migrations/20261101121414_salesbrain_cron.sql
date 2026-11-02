-- Supabase only: send due Sales Brain events every minute (see helpers/salesBrain.tsx).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'hso-salesbrain';
select cron.schedule(
  'hso-salesbrain',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gcuzmuztikisxsmkgtbi.supabase.co/functions/v1/api/cron/salesbrain?forceFunctionRegion=ap-southeast-2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hso_cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
