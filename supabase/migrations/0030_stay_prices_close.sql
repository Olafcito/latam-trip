-- A stay_prices task closes by the data (TECH-007, phase 4 of FEAT-006). The app queues it to refresh the prices of some
-- rooms of a place for some dates, the cloud runner prices each room and closes the task. When another path writes the
-- prices first, such as a chat session that prices the rooms itself, the task stayed open until the runner came to it.
-- Now the database closes it: every room in room_ids exists in the task's lodging and has a price for the task's
-- check_in and check_out that was seen after the task was queued, so a price that was already there does not close a
-- fresh task. A task without dates, without rooms or with a room that is gone never closes. Only an open or working
-- task closes and a failed one is never touched. Every function runs as its owner with a fixed search_path and judges
-- the task by the rows of the task's own owner.

create function public.stay_prices_complete(p_owner uuid, p_lodging text, p_rooms jsonb, p_check_in date,
                                            p_check_out date, p_since timestamptz)
returns boolean
language plpgsql stable set search_path = public as $$
begin
  if p_check_in is null or p_check_out is null or p_rooms is null or jsonb_typeof(p_rooms) <> 'array'
     or jsonb_array_length(p_rooms) = 0 then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements_text(p_rooms) as want(room_id)
    where not exists (select 1 from public.lodging_rooms r
                      where r.owner_id = p_owner and r.lodging_id = p_lodging and r.id = want.room_id)
       or not exists (select 1 from public.lodging_prices p
                      where p.owner_id = p_owner and p.room_id = want.room_id
                        and p.check_in = p_check_in and p.check_out = p_check_out and p.observed_at >= p_since));
end $$;
revoke all on function public.stay_prices_complete(uuid, text, jsonb, date, date, timestamptz) from public, anon, authenticated;

-- Closes the complete open or working stay_prices tasks of one owner's lodging, of every lodging of one owner when
-- p_lodging is null, or of everyone when both are null. Returns how many closed.
create function public.close_stay_prices(p_lodging text, p_owner uuid default null) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  ci date;
  co date;
  closed int := 0;
  hit int;
begin
  for t in select k.id, k.owner_id, k.data, k.created_at from public.tasks k
           where coalesce(k.type, k.data->>'type') = 'stay_prices' and k.status in ('open', 'working')
             and k.data->>'lodging_id' is not null and (p_lodging is null or k.data->>'lodging_id' = p_lodging)
             and (p_owner is null or k.owner_id = p_owner)
           order by k.id
           for update of k skip locked
  loop
    -- dates written by hand can be bad text, that must never block a write to a price, so they count as absent
    begin
      ci := nullif(t.data->>'check_in', '')::date;
      co := nullif(t.data->>'check_out', '')::date;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      ci := null;
      co := null;
    end;
    continue when not public.stay_prices_complete(t.owner_id, t.data->>'lodging_id', t.data->'room_ids', ci, co,
                                                   t.created_at);
    update public.tasks
       set status = 'done', done_at = now(),
           result = 'Closed by the data: ' || jsonb_array_length(t.data->'room_ids') || ' rooms priced for '
                    || ci || ' to ' || co || '.'
     where owner_id = t.owner_id and id = t.id and status in ('open', 'working');
    get diagnostics hit = row_count;
    closed := closed + hit;
  end loop;
  return closed;
end $$;
revoke all on function public.close_stay_prices(text, uuid) from public, anon, authenticated;

create function public.stay_prices_follow_data() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lid text;
begin
  select r.lodging_id into lid from public.lodging_rooms r where r.owner_id = new.owner_id and r.id = new.room_id;
  if lid is not null then
    perform public.close_stay_prices(lid, new.owner_id);
  end if;
  return null;
end $$;
revoke all on function public.stay_prices_follow_data() from public, anon, authenticated;

drop trigger if exists lodging_prices_stay_prices_follow on public.lodging_prices;
create trigger lodging_prices_stay_prices_follow after insert or update on public.lodging_prices
  for each row execute function public.stay_prices_follow_data();

-- The tasks that were complete before this, by the same check.
select public.close_stay_prices(null, null);
