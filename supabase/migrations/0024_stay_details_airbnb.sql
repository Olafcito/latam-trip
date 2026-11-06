-- stay_details for Airbnb places too. Adding an Airbnb place gives no price, since Airbnb loads its price only in a
-- browser, so the place stays incomplete unless something reads it. The trigger of 0022 now queues one stay_details
-- task for each Booking.com or Airbnb place that is added and not hidden, and a browser worker on Simon's PC completes
-- it by the add-lodging skill (plugin/skills/add-lodging). The type stays out of task_runs_in_cloud, as in 0022.
-- Runs as its owner with a fixed search_path, as before.

create or replace function public.queue_stay_details() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.hidden
     and exists (select 1 from jsonb_array_elements(new.links) l where l->>'site' in ('booking', 'airbnb'))
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

-- The Airbnb places added before this that still lack photos or a price: one task each, unless one is under way.
insert into public.tasks (type, title, status, data)
select 'stay_details', '[stay_details] ' || l.name, 'open',
       jsonb_build_object('type', 'stay_details', 'lodging_id', l.id, 'from', 'lodging')
from public.lodgings l
where not l.hidden
  and exists (select 1 from jsonb_array_elements(l.links) k where k->>'site' = 'airbnb')
  and (jsonb_array_length(l.photos) = 0
       or not exists (select 1 from public.lodging_rooms r join public.lodging_prices p on p.room_id = r.id
                      where r.lodging_id = l.id))
  and not exists (select 1 from public.tasks t
                  where coalesce(t.type, t.data->>'type') = 'stay_details'
                    and t.status in ('open', 'working') and t.data->>'lodging_id' = l.id);
