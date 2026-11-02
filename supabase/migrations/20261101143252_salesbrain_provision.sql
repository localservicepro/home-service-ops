-- Sales Brain can give a customer free access (and create their account): see helpers/salesBrainProvision.tsx.
alter table hso.businesses add column if not exists sb_external_id text;   -- Sales Brain's id for this customer
create unique index if not exists businesses_sb_external_id_idx on hso.businesses (sb_external_id) where sb_external_id is not null;
alter table hso.businesses add column if not exists comp_source text;      -- who gave free access: 'salesbrain' | 'staff'
alter table hso.businesses add column if not exists comp_note text;        -- shown on Plan & billing, e.g. "Included with your website plan"
update hso.businesses set comp_source = 'staff' where comp and comp_source is null;
