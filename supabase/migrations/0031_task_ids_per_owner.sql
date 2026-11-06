-- Task, inbox and task_log ids per owner (TECH-009, task 4.3 of FEAT-006). These three tables kept identity ids that
-- accept an explicit id and were keyed by the id alone, so a person inserting an id another person holds got a 409
-- that said the id exists. Nothing else leaked, the row stayed hidden, but it was an answer a fresh id does not give.
-- They are now keyed (owner_id, id) the way 0027 keyed lodgings and bookings, and task_log (owner_id, seq), so an id
-- that someone else holds is as free as a new one. Identity values still come from one counter per table, which only
-- tells a person how many rows exist in all.
--
-- Everything that followed a task by its id alone matches on the owner too. The foreign keys: none points at these
-- tables. The functions: close_stay_details of 0025 to 0027 updated the task by id, and close_stay_prices of 0030
-- already matches on owner and id. The clients: the connector's claim, finish, fail, update, delete and the undo of a
-- task delete, tasks.py and tripdb_store already name the caller's owner on every read and write.

alter table public.tasks drop constraint tasks_pkey, add primary key (owner_id, id);
alter table public.inbox drop constraint inbox_pkey, add primary key (owner_id, id);
alter table public.task_log drop constraint task_log_pkey, add primary key (owner_id, seq);

-- the owner is the first column of each key now, so the single column indexes of 0027 repeat it
drop index public.tasks_owner_id;
drop index public.task_log_owner_id;
drop index public.inbox_owner_id;

-- close_stay_details as in 0027, closing the task by owner and id
create or replace function public.close_stay_details(p_lodging text, p_owner uuid default null) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  d record;
  ci date;
  co date;
  n_photos int;
  n_rooms int;
  closed int := 0;
  hit int;
begin
  for t in select k.id, k.owner_id, k.data from public.tasks k
           where coalesce(k.type, k.data->>'type') = 'stay_details' and k.status in ('open', 'working')
             and k.data->>'lodging_id' is not null and (p_lodging is null or k.data->>'lodging_id' = p_lodging)
             and (p_owner is null or k.owner_id = p_owner)
             and exists (select 1 from public.lodgings l where l.owner_id = k.owner_id and l.id = k.data->>'lodging_id')
           order by k.owner_id, k.id
           for update of k skip locked
  loop
    -- dates written by hand can be bad text, that must never block a write to a lodging, so they count as absent
    begin
      ci := nullif(t.data->>'check_in', '')::date;
      co := nullif(t.data->>'check_out', '')::date;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      ci := null;
      co := null;
    end;
    continue when not public.stay_details_complete(t.owner_id, t.data->>'lodging_id', ci, co);
    select * into d from public.stay_details_dates(t.owner_id, t.data->>'lodging_id', ci, co);
    select jsonb_array_length(photos) into n_photos from public.lodgings
      where owner_id = t.owner_id and id = t.data->>'lodging_id';
    select count(*) into n_rooms from public.lodging_rooms
      where owner_id = t.owner_id and lodging_id = t.data->>'lodging_id';
    update public.tasks
       set status = 'done', done_at = now(),
           result = 'Closed by the data: ' || n_photos || ' photos, ' || n_rooms || ' rooms, each priced for '
                    || d.check_in || ' to ' || d.check_out || '.'
     where owner_id = t.owner_id and id = t.id and status in ('open', 'working');
    get diagnostics hit = row_count;
    closed := closed + hit;
  end loop;
  return closed;
end $$;
revoke all on function public.close_stay_details(text, uuid) from public, anon, authenticated;
