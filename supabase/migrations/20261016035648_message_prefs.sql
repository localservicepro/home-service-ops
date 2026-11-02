-- How each business sends quotes, invoices and review requests: { quotes, invoices, reviews },
-- each "email" | "sms" | "both". Missing keys mean email.
alter table hso.settings add column if not exists message_prefs jsonb not null default '{}';
