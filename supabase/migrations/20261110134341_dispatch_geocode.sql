-- Dispatch map: addresses placed on the map, looked up once and shared by every business.
-- key = the address normalised (lower case, punctuation and a trailing "Australia" removed).
-- status 'ok' has lat/lng; 'not_found' is retried after a week. Lookup errors aren't stored.
create table if not exists hso.geocode_cache (
  key text primary key,
  address text not null,
  lat double precision,
  lng double precision,
  status text not null check (status in ('ok', 'not_found')),
  provider text not null,
  updated_at timestamptz not null default now()
);
alter table hso.geocode_cache enable row level security;
