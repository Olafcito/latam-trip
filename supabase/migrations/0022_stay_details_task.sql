-- The stay_details task: every Booking.com place that is added queues one task for Simon's PC. The cloud task runner
-- adds a Booking.com place with one room and no photos, because the Booking.com connector gives nothing more. A
-- headless browser on the PC reads the hotel page, and the checklist run stores every room, the room photos, the price
-- of each room for the dates and the place photos (docs/claude-tasks.md). stay_details is not a cloud type, so
-- task_runs_in_cloud stays as 0021 left it and no run is started for it. A hidden place gets no task, and a place
-- that already has an open or working stay_details task does not get a second one.
-- Runs as its owner with a fixed search_path, since the insert comes from the connector and the app under their own roles.

create or replace function public.queue_stay_details() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.hidden
     and exists (select 1 from jsonb_array_elements(new.links) l where l->>'site' = 'booking')
     and not exists (select 1 from public.tasks t
                     where coalesce(t.type, t.data->>'type') = 'stay_details'
                       and t.status in ('open', 'working') and t.data->>'lodging_id' = new.id) then
    insert into public.tasks (type, title, status, data)
    values ('stay_details', '[stay_details] ' || new.name, 'open',
            jsonb_build_object('type', 'stay_details', 'lodging_id', new.id, 'from', 'lodging'));
  end if;
  return new;
end $$;
revoke all on function public.queue_stay_details() from public, anon, authenticated;

drop trigger if exists lodgings_queue_stay_details on public.lodgings;
create trigger lodgings_queue_stay_details after insert on public.lodgings
  for each row execute function public.queue_stay_details();

-- The places added before this: one task for each Booking.com place that is not hidden and has none under way.
insert into public.tasks (type, title, status, data)
select 'stay_details', '[stay_details] ' || l.name, 'open',
       jsonb_build_object('type', 'stay_details', 'lodging_id', l.id, 'from', 'lodging')
from public.lodgings l
where not l.hidden
  and exists (select 1 from jsonb_array_elements(l.links) k where k->>'site' = 'booking')
  and not exists (select 1 from public.tasks t
                  where coalesce(t.type, t.data->>'type') = 'stay_details'
                    and t.status in ('open', 'working') and t.data->>'lodging_id' = l.id);
