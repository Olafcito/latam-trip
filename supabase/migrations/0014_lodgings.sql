-- The places to stay of spec 5.2: a place, its rooms and the prices of each room for a date range.
-- Only places Simon added, or asked Claude to add, are here. The old stays table and profiles.hostels stay as they are.
-- Prices and notes are private, so these tables live behind the owner only rule and never in a built file,
-- like bookings in 0013_bookings.sql. kind, added_by, bathroom and the sites are checked by the tripdb schemas.

create table public.lodgings (
  id text primary key default gen_random_uuid()::text,
  place_id text not null,
  name text not null,
  kind text not null,
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array'),
  rating numeric check (rating >= 0 and rating <= 10),
  reviews int check (reviews >= 0),
  rating_source text,
  address text,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  to_center_km numeric check (to_center_km >= 0),
  to_beach_km numeric check (to_beach_km >= 0),
  tags text[] not null default '{}',
  summary text,
  notes text,
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array'),
  added_by text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lodging_rooms (
  id text primary key default gen_random_uuid()::text,
  lodging_id text not null references public.lodgings(id) on delete cascade,
  name text not null,
  beds int check (beds >= 1),
  private boolean,
  bathroom text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lodging_prices (
  id text primary key default gen_random_uuid()::text,
  room_id text not null references public.lodging_rooms(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  total_dkk numeric check (total_dkk >= 0),
  per_night_dkk numeric check (per_night_dkk >= 0),
  site text,
  url text,
  refundable text check (refundable in ('yes', 'no', 'partly')),
  cancel_until date,
  observed_at timestamptz not null default now(),
  -- a stay leaves after it arrives, and a price row holds a price
  check (check_out > check_in),
  check (total_dkk is not null or per_night_dkk is not null)
);

create index lodgings_place_id on public.lodgings (place_id);
create index lodging_rooms_lodging_id on public.lodging_rooms (lodging_id);
create index lodging_prices_room_id on public.lodging_prices (room_id, check_in);

-- updated_at follows every update, with the function from 0013_bookings.sql.
create trigger touch_updated_at before update on public.lodgings
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.lodging_rooms
  for each row execute function public.touch_updated_at();

-- Only the one owner account gets in, as in 0002_rls.sql. The secret key bypasses it.
-- New tables are granted to anon by default, so the grant is taken back here.
alter table public.lodgings enable row level security;
create policy owner_all on public.lodgings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.lodgings from anon;

alter table public.lodging_rooms enable row level security;
create policy owner_all on public.lodging_rooms for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.lodging_rooms from anon;

alter table public.lodging_prices enable row level security;
create policy owner_all on public.lodging_prices for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.lodging_prices from anon;

-- The planner reads them live, like trips and bookings.
-- Realtime hands a change to a client only when row level security lets that client read the row.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lodgings') then
    alter publication supabase_realtime add table public.lodgings;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lodging_rooms') then
    alter publication supabase_realtime add table public.lodging_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lodging_prices') then
    alter publication supabase_realtime add table public.lodging_prices;
  end if;
end $$;
