-- Appointment reminders to clients before a scheduled job (email, SMS or both; see
-- settings.message_prefs -> reminders). Sent by the api's /cron/tick, run by pg_cron.
alter table hso.settings add column if not exists reminders_enabled boolean not null default false;
alter table hso.settings add column if not exists reminder_hours int not null default 24;
alter table hso.settings add column if not exists reminder_message text;

alter table hso.jobs add column if not exists reminder_sent_at timestamptz;
alter table hso.jobs add column if not exists reminder_sent_to text;
alter table hso.jobs add column if not exists reminder_status text;
create index if not exists jobs_reminder_due_idx on hso.jobs (business_id, scheduled_date)
  where status = 'Job Scheduled' and reminder_status is null;
