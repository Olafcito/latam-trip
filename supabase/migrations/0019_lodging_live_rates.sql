-- Live rates from Hostelworld (FEAT-002, TECH-003). The stay-rates edge function reads a place's rooms and prices
-- for the dates straight from Hostelworld and writes them here. A room remembers the site it was read from and its
-- id there, so the next read finds the same room again instead of adding a second one with a changed name, and it
-- keeps a photo. A price remembers how many beds (a dorm) or rooms (a private) were left when it was seen.

alter table public.lodging_rooms
  add column if not exists site text,
  add column if not exists site_id text,
  add column if not exists photo text;

alter table public.lodging_prices
  add column if not exists available integer check (available >= 0);

create index if not exists lodging_rooms_site on public.lodging_rooms (lodging_id, site, site_id);
