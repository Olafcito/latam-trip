-- FEAT-007, 2026-11-07. A shared link shows the places to stay the owner has booked for the trip as well as the ones
-- planned. A booked stay goes out as its place, its nights, the place to stay and the room alone, under an id of its own
-- order. Never its reference, seller, links, what was paid or its currency, its travellers, notes or files. A room only
-- a booking names comes without the sites' quotes. A room a planned stay names keeps them, as in 0041, since a quote is
-- not what was paid. Only stays booked on this trip.
create or replace function public.shared_trip(token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s record;
  d jsonb;
  places jsonb;
  lodging_ids text[];
  room_ids text[];
  priced text[];
  booked jsonb;
begin
  select x.owner_id, x.trip_id into s from public.trip_shares x where x.token = shared_trip.token and x.revoked_at is null;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.trips t where t.owner_id = s.owner_id and t.id = s.trip_id and t.deleted_at is not null) then
    return null;
  end if;
  select t.data into d from public.trips t where t.owner_id = s.owner_id and t.id = s.trip_id
    order by t.version desc limit 1;
  if d is null then
    return null;
  end if;

  -- each stop with its plan, and its stays with the place, the room and the nights alone
  select coalesce(jsonb_agg((
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p) as f(k, v)
    where k in ('node', 'hop', 'why', 'nights', 'arrive', 'depart')
  ) || case when jsonb_typeof(p->'stays') = 'array' then jsonb_build_object('stays', (
    select coalesce(jsonb_agg((
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(st) as g(k, v)
      where k in ('lodging_id', 'room_id', 'nights')
    ) order by j), '[]'::jsonb)
    from jsonb_array_elements(p->'stays') with ordinality as b(st, j)
    where jsonb_typeof(st) = 'object'
  )) else '{}'::jsonb end order by i), '[]'::jsonb) into places
  from jsonb_array_elements(case when jsonb_typeof(d->'places') = 'array' then d->'places' else '[]'::jsonb end)
    with ordinality as a(p, i)
  where jsonb_typeof(p) = 'object';

  -- the owner's booked stays on this trip, in the order they start
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'booked-' || b.n, 'place_id', b.place_id, 'check_in', b.check_in, 'check_out', b.check_out,
    'lodging_id', b.lodging_id, 'room_id', b.room_id
  ) order by b.n), '[]'::jsonb) into booked
  from (
    select x.place_id, x.check_in, x.check_out, x.lodging_id, x.room_id,
           row_number() over (order by x.check_in, x.check_out, x.id) as n
    from public.bookings x
    where x.owner_id = s.owner_id and x.trip_id = s.trip_id and x.kind = 'stay' and x.status = 'booked'
      and x.place_id is not null and x.check_in is not null and x.check_out is not null
  ) b;

  -- a room a planned stay names carries the quoted prices, a room only a booking names carries none
  select coalesce(array_agg(distinct st->>'room_id') filter (where st->>'room_id' is not null), '{}')
    into priced
  from jsonb_array_elements(places) as a(p),
       jsonb_array_elements(coalesce(p->'stays', '[]'::jsonb)) as b(st);

  select coalesce(array_agg(distinct x.l) filter (where x.l is not null), '{}'),
         coalesce(array_agg(distinct x.r) filter (where x.r is not null), '{}')
    into lodging_ids, room_ids
  from (
    select st->>'lodging_id' as l, st->>'room_id' as r
    from jsonb_array_elements(places) as a(p),
         jsonb_array_elements(coalesce(p->'stays', '[]'::jsonb)) as b(st)
    union all
    select bk->>'lodging_id', bk->>'room_id' from jsonb_array_elements(booked) as c(bk)
  ) x;

  return (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(d) as e(k, v)
    where k in ('id', 'version', 'name', 'saved_at', 'why', 'rank', 'option_id', 'way_in', 'way_home', 'tickets', 'lastNights')
  ) || jsonb_build_object('places', places, 'bookings', booked, 'lodgings', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'place_id', l.place_id, 'name', l.name, 'kind', l.kind, 'photos', l.photos,
      'rating', l.rating, 'reviews', l.reviews, 'rating_source', l.rating_source, 'address', l.address,
      'lat', l.lat, 'lon', l.lon, 'to_center_km', l.to_center_km, 'to_beach_km', l.to_beach_km,
      'tags', to_jsonb(l.tags), 'summary', l.summary, 'links', l.links,
      'rooms', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'lodging_id', r.lodging_id, 'name', r.name, 'beds', r.beds, 'private', r.private,
          'bathroom', r.bathroom, 'site', r.site, 'photo', r.photo,
          'prices', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', x.id, 'room_id', x.room_id, 'check_in', x.check_in, 'check_out', x.check_out,
              'total_dkk', x.total_dkk, 'per_night_dkk', x.per_night_dkk, 'site', x.site,
              'refundable', x.refundable, 'cancel_until', x.cancel_until, 'available', x.available,
              'observed_at', x.observed_at
            ) order by x.check_in, x.check_out, x.observed_at, x.id), '[]'::jsonb)
            from public.lodging_prices x where x.owner_id = s.owner_id and x.room_id = r.id and r.id = any(priced)
          )
        ) order by r.name, r.id), '[]'::jsonb)
        from public.lodging_rooms r
        where r.owner_id = s.owner_id and r.lodging_id = l.id and r.id = any(room_ids)
      )
    ) order by l.id), '[]'::jsonb)
    from public.lodgings l where l.owner_id = s.owner_id and l.id = any(lodging_ids)
  ));
end $$;
revoke execute on function public.shared_trip(text) from public;
grant execute on function public.shared_trip(text) to anon, authenticated;
