-- Extra job details: custom fields (label/value pairs) entered in the app or synced from LeadConnector.
alter table hso.jobs add column if not exists custom_fields jsonb not null default '[]';
