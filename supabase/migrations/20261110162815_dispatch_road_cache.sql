-- Dispatch map: road routes and travel-time tables from the routing service, kept for a while so
-- the same request isn't sent twice (OSRM's free server asks for light use; Google bills per call).
-- Shared by every business: it holds coordinates and road geometry only, nothing about customers.
create table if not exists hso.road_cache (
  key text primary key,
  data jsonb not null,
  expires_at timestamptz not null
);
create index if not exists road_cache_expires_idx on hso.road_cache (expires_at);
alter table hso.road_cache enable row level security;
