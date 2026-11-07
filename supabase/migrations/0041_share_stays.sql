-- FEAT-007, 2026-11-07. A shared link shows where the owner plans to sleep. Each stop carries its planned stays, and
-- the answer carries the places to stay those stays name: what a listing shows about the place, the planned rooms and
-- the prices the sites quoted for them. Never the owner's notes on a place or a room, who added it, whether it is
-- hidden, nor anything of a booking. A place or a room no stay names is left out.
create or replace function public.shared_trip(token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s record;
  d jsonb;
  places jsonb;
  lodging_ids text[];
  room_ids text[];
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

  select coalesce(array_agg(distinct st->>'lodging_id') filter (where st->>'lodging_id' is not null), '{}'),
         coalesce(array_agg(distinct st->>'room_id') filter (where st->>'room_id' is not null), '{}')
    into lodging_ids, room_ids
  from jsonb_array_elements(places) as a(p),
       jsonb_array_elements(coalesce(p->'stays', '[]'::jsonb)) as b(st);

  return (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(d) as e(k, v)
    where k in ('id', 'version', 'name', 'saved_at', 'why', 'rank', 'option_id', 'way_in', 'way_home', 'tickets', 'lastNights')
  ) || jsonb_build_object('places', places, 'lodgings', (
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
            from public.lodging_prices x where x.owner_id = s.owner_id and x.room_id = r.id
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
