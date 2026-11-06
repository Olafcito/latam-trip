-- A stay_details task closes by the data (TECH-007). The task of 0022 and 0024 waits for Simon's PC, which reads the
-- hotel page and stores the rooms, the prices and the photos. When another path stores them first, such as a chat
-- session that adds the place and fills it in the same turn, the task stayed open and the PC read the page again.
-- Now the database closes it: a place is complete when it has photos, at least one room and, for the dates, a price
-- on every room. The dates are the task's check_in and check_out, else those of the lodging's latest price by
-- observed_at (docs/claude-tasks.md). No price at all means not complete. Only an open or working task closes, a
-- failed or done one is left alone. The result holds counts and dates, never a price.
-- tasks.py done on a task the data already closed leaves it as it is (plugin/skills/trip-checklist/scripts/tasks.py).
-- Phase 4 of FEAT-006 copies the pattern for stay_prices. All functions run as their owner with a fixed search_path.

-- The dates a lodging is judged for: the task's when it has both, else those of the latest price of any room.
create or replace function public.stay_details_dates(p_lodging text, p_check_in date, p_check_out date,
                                                     out check_in date, out check_out date)
language plpgsql stable set search_path = public as $$
begin
  if p_check_in is not null and p_check_out is not null then
    check_in := p_check_in;
    check_out := p_check_out;
    return;
  end if;
  select p.check_in, p.check_out into check_in, check_out
  from public.lodging_prices p join public.lodging_rooms r on r.id = p.room_id
  where r.lodging_id = p_lodging
  order by p.observed_at desc, p.id
  limit 1;
end $$;
revoke all on function public.stay_details_dates(text, date, date) from public, anon, authenticated;

create or replace function public.stay_details_complete(p_lodging text, p_check_in date, p_check_out date) returns boolean
language plpgsql stable set search_path = public as $$
declare
  d record;
begin
  select * into d from public.stay_details_dates(p_lodging, p_check_in, p_check_out);
  if d.check_in is null or d.check_out is null then
    return false;
  end if;
  return exists (select 1 from public.lodgings l where l.id = p_lodging and jsonb_array_length(l.photos) > 0)
     and exists (select 1 from public.lodging_rooms r where r.lodging_id = p_lodging)
     and not exists (select 1 from public.lodging_rooms r
                     where r.lodging_id = p_lodging
                       and not exists (select 1 from public.lodging_prices p
                                       where p.room_id = r.id and p.check_in = d.check_in and p.check_out = d.check_out));
end $$;
revoke all on function public.stay_details_complete(text, date, date) from public, anon, authenticated;

-- Closes the open or working stay_details tasks of one lodging, or of every lodging when null, that are complete.
-- Returns how many it closed. A task row another session holds locked is skipped, that session is closing it.
create or replace function public.close_stay_details(p_lodging text) returns integer
language plpgsql security definer set search_path = public as $$
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
  for t in select id, data from public.tasks
           where coalesce(type, data->>'type') = 'stay_details' and status in ('open', 'working')
             and data->>'lodging_id' is not null and (p_lodging is null or data->>'lodging_id' = p_lodging)
           order by id
           for update skip locked
  loop
    -- dates written by hand can be bad text, that must never block a write to a lodging, so they count as absent
    begin
      ci := nullif(t.data->>'check_in', '')::date;
      co := nullif(t.data->>'check_out', '')::date;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      ci := null;
      co := null;
    end;
    continue when not public.stay_details_complete(t.data->>'lodging_id', ci, co);
    select * into d from public.stay_details_dates(t.data->>'lodging_id', ci, co);
    select jsonb_array_length(photos) into n_photos from public.lodgings where id = t.data->>'lodging_id';
    select count(*) into n_rooms from public.lodging_rooms where lodging_id = t.data->>'lodging_id';
    update public.tasks
       set status = 'done', done_at = now(),
           result = 'Closed by the data: ' || n_photos || ' photos, ' || n_rooms || ' rooms, each priced for '
                    || d.check_in || ' to ' || d.check_out || '.'
     where id = t.id and status in ('open', 'working');
    get diagnostics hit = row_count;
    closed := closed + hit;
  end loop;
  return closed;
end $$;
revoke all on function public.close_stay_details(text) from public, anon, authenticated;

-- One trigger function for the three tables. It finds the lodging of the changed row and closes what is complete.
create or replace function public.stay_details_follow_data() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lid text;
begin
  if tg_table_name = 'lodgings' then
    lid := new.id;
  elsif tg_table_name = 'lodging_rooms' then
    if tg_op = 'DELETE' then
      lid := old.lodging_id;
    else
      lid := new.lodging_id;
      if tg_op = 'UPDATE' and old.lodging_id is distinct from new.lodging_id then
        perform public.close_stay_details(old.lodging_id);
      end if;
    end if;
  else
    select r.lodging_id into lid from public.lodging_rooms r where r.id = new.room_id;
  end if;
  if lid is not null then
    perform public.close_stay_details(lid);
  end if;
  return null;
end $$;
revoke all on function public.stay_details_follow_data() from public, anon, authenticated;

-- Named to fire after lodgings_queue_stay_details of 0022, which sorts first.
drop trigger if exists lodgings_stay_details_follow on public.lodgings;
create trigger lodgings_stay_details_follow after insert or update of photos on public.lodgings
  for each row execute function public.stay_details_follow_data();

drop trigger if exists lodging_rooms_stay_details_follow on public.lodging_rooms;
create trigger lodging_rooms_stay_details_follow after insert or update or delete on public.lodging_rooms
  for each row execute function public.stay_details_follow_data();

drop trigger if exists lodging_prices_stay_details_follow on public.lodging_prices;
create trigger lodging_prices_stay_details_follow after insert or update on public.lodging_prices
  for each row execute function public.stay_details_follow_data();

-- The tasks that were complete before this: 10039 to 10041 and any other, by the same check.
select public.close_stay_details(null);
