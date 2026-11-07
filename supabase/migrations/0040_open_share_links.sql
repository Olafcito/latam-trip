-- FEAT-007, 2026-11-07. A shared link opens without a sign in. shared_trip answers anyone who holds a live token,
-- signed in or not, so a friend opens the link and looks at the trip and the map straight away. The token is 128
-- random bits, the answer is still the plan alone, and stop_sharing still ends the link at once. Making, ending and
-- listing links stays with the signed in owner.
create or replace function public.shared_trip(token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s record;
  d jsonb;
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
  return (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(d) as e(k, v)
    where k in ('id', 'version', 'name', 'saved_at', 'why', 'rank', 'option_id', 'way_in', 'way_home', 'tickets', 'lastNights')
  ) || jsonb_build_object('places', (
    select coalesce(jsonb_agg((
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p) as f(k, v)
      where k in ('node', 'hop', 'why', 'nights', 'arrive', 'depart')
    ) order by i), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(d->'places') = 'array' then d->'places' else '[]'::jsonb end)
      with ordinality as a(p, i)
  ));
end $$;
revoke execute on function public.shared_trip(text) from public;
grant execute on function public.shared_trip(text) to anon, authenticated;
