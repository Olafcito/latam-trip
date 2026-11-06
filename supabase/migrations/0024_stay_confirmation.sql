-- A stay booking says where it was booked and how its confirmation came in, as a flight's seller and mail link do.
-- provider is the platform, with the same values as a lodging's links. Other is a direct booking or a friend's place,
-- and then seller holds its name and seller_url its link. confirmation_source is where the confirmation came from.
-- paid is what was paid when booking, in the booking's currency, so the balance at the property is price less paid.
-- The times are the local clock times the confirmation gives for check-in and check-out. room_name is the room as the
-- confirmation names it, rooms how many were booked. Every column is nullable, so flight rows stay as they are.
-- public.bookings stays owner only through the rule of 0013_bookings.sql, and never reaches a built file.

alter table public.bookings
  add column provider text check (provider in ('booking', 'hostelworld', 'airbnb', 'own', 'other')),
  add column seller_url text check (seller_url is null or seller_url ~* '^https?://'),
  add column confirmation_source text check (confirmation_source in ('gmail', 'upload', 'url', 'manual', 'other')),
  add column paid numeric check (paid >= 0),
  add column check_in_time text check (check_in_time ~ '^\d{2}:\d{2}$'),
  add column check_out_time text check (check_out_time ~ '^\d{2}:\d{2}$'),
  add column room_name text,
  add column rooms int check (rooms >= 1),
  -- a booking with another provider names it
  add constraint bookings_other_named check (provider is distinct from 'other' or (seller is not null and seller_url is not null));

-- the stays booked so far take their provider from the seller they name
update public.bookings set provider = case
    when lower(seller) like '%hostelworld%' then 'hostelworld'
    when lower(seller) like '%booking%' then 'booking'
    when lower(seller) like '%airbnb%' then 'airbnb'
  end
where kind = 'stay' and seller is not null;
