-- save_trip(trip jsonb): saves a trip as the next version of its id and says what it did.
-- Two writers of one id queue on an advisory lock, so the versions come out 1, 2 without a gap or a clash.
-- A trip with the content of the latest version (ignoring version, saved_at and by) is skipped.
-- An id with a deleted version is refused, so the id stays hidden until someone restores it.

create function public.save_trip(trip jsonb) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  tid text := trip->>'id';
  prev public.trips;
  v int;
  stamp timestamptz := now();
  doc jsonb;
begin
  if tid is null or tid = '' then
    raise exception 'trip has no id';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trip:' || tid, 0));
  if exists (select 1 from public.trips where id = tid and deleted_at is not null) then
    raise exception 'trip % was deleted', tid;
  end if;
  select * into prev from public.trips where id = tid order by version desc limit 1;
  if found and (prev.data - 'version' - 'saved_at' - 'by') = (trip - 'version' - 'saved_at' - 'by') then
    return jsonb_build_object('id', tid, 'version', prev.version, 'skipped', true);
  end if;
  v := coalesce(prev.version, 0) + 1;
  doc := trip || jsonb_build_object('version', v,
                                    'saved_at', to_char(stamp at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  insert into public.trips (id, version, saved_at, saved_by, data) values (tid, v, stamp, doc->>'by', doc);
  return jsonb_build_object('id', tid, 'version', v, 'skipped', false);
end;
$$;

revoke execute on function public.save_trip(jsonb) from public, anon;
grant execute on function public.save_trip(jsonb) to authenticated, service_role;
