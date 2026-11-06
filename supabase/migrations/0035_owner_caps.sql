-- Caps per person (task 6.2 of FEAT-006, findings 11 and 12). owner_limits of 0027 named the limits and nothing held
-- them. A statement level trigger on each private table now refuses an insert that would take one person past their
-- rows in that table, and on tasks also past the tasks they made today (UTC). A restrictive policy on the bookings
-- bucket refuses a file that would take the person's folder past its bytes. The admin has the same caps, as in 0027.
--
-- A table may have a limit of its own, rows_in_<table>, which wins over rows_per_private_table. The tables that only
-- grow get one: every trip save is a new version, task_log, agent_usage and the tasks keep what was done, quotes come
-- in bursts from a crawl and the morning rates add prices as history. Each limit holds the admin's rows on 2026-11-06
-- plus at least 26 weeks at 3 times the rows of that last week (TECH-009 has the numbers), so the worker and save_trip
-- run through the trip. bookings, inbox and user_documents stay on rows_per_private_table.
--
-- The cap is counted after the insert, under a lock per table and owner held to the end of the transaction, so two
-- writes at the same time cannot both slip under it. user_profiles holds one row per person by its key, so it has no
-- row cap. A missing limit row means no cap, so a limit is lifted by deleting its row.

insert into public.owner_limits (name, value, unit) values
  ('rows_in_trips', 5000, 'rows'),
  ('rows_in_lodgings', 5000, 'rows'),
  ('rows_in_lodging_rooms', 25000, 'rows'),
  ('rows_in_lodging_prices', 100000, 'rows'),
  ('rows_in_quotes', 100000, 'rows'),
  ('rows_in_tasks', 5000, 'rows'),
  ('rows_in_task_log', 5000, 'rows'),
  ('rows_in_agent_usage', 10000, 'rows')
on conflict (name) do nothing;

-- the tasks each person added per UTC day. A client can set created_at and can delete a task and add it again, so the
-- day is counted here, as take_read_booking counts its reads (0029). Only hold_owner_caps writes it, no client reads it,
-- and a refused insert takes its count back with it. An undo through the connector adds its task again and counts.
create table public.task_day_counts (
  owner_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  tasks integer not null default 0 check (tasks >= 0),
  primary key (owner_id, day)
);
alter table public.task_day_counts enable row level security;
revoke all on public.task_day_counts from anon, authenticated;

create function public.hold_owner_caps() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cap bigint;
  day_cap bigint;
  o uuid;
  n bigint;
begin
  select coalesce((select value from public.owner_limits where name = 'rows_in_' || tg_table_name),
                  (select value from public.owner_limits where name = 'rows_per_private_table'))
    into cap;
  if tg_table_name = 'tasks' then
    select value into day_cap from public.owner_limits where name = 'tasks_per_day';
  end if;
  for o in select distinct owner_id from changed where owner_id is not null order by owner_id loop
    perform pg_advisory_xact_lock(hashtextextended('owner_caps:' || tg_table_name || ':' || o::text, 0));
    if cap is not null then
      execute format('select count(*) from public.%I where owner_id = $1', tg_table_name) into n using o;
      if n > cap then
        raise exception using errcode = 'P0001',
          message = format('The limit is %s rows in %s per person, and this insert would pass it.', cap, tg_table_name),
          hint = 'owner_limits names the limit.';
      end if;
    end if;
    if day_cap is not null then
      insert into public.task_day_counts as d (owner_id, day, tasks)
        values (o, (now() at time zone 'utc')::date, (select count(*) from changed where owner_id = o))
        on conflict (owner_id, day) do update set tasks = d.tasks + excluded.tasks
        returning tasks into n;
      if n > day_cap then
        raise exception using errcode = 'P0001',
          message = format('The limit is %s tasks a day per person, and this insert would pass it.', day_cap),
          hint = 'owner_limits names the limit.';
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.hold_owner_caps() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['trips', 'bookings', 'lodgings', 'lodging_rooms', 'lodging_prices', 'quotes', 'tasks',
                           'task_log', 'inbox', 'agent_usage', 'user_documents'] loop
    execute format('create trigger hold_owner_caps after insert on public.%I referencing new table as changed
                    for each statement execute function public.hold_owner_caps()', t);
  end loop;
end $$;

-- A new lodging with a Booking.com or Airbnb link queues its stay_details task (0027). A person at the tasks cap still
-- adds the lodging, with no task. Only the cap's own refusal, known by its hint, is caught, and every other error stands.
create or replace function public.queue_stay_details() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  why text;
begin
  if not new.hidden
     and exists (select 1 from jsonb_array_elements(new.links) l where l->>'site' in ('booking', 'airbnb'))
     and not exists (select 1 from public.tasks t
                     where t.owner_id = new.owner_id
                       and coalesce(t.type, t.data->>'type') = 'stay_details'
                       and t.status in ('open', 'working') and t.data->>'lodging_id' = new.id) then
    begin
      insert into public.tasks (owner_id, type, title, status, data)
      values (new.owner_id, 'stay_details', '[stay_details] ' || new.name, 'open',
              jsonb_build_object('type', 'stay_details', 'lodging_id', new.id, 'from', 'lodging'));
    exception when raise_exception then
      get stacked diagnostics why = pg_exception_hint;
      if why is distinct from 'owner_limits names the limit.' then
        raise;
      end if;
    end;
  end if;
  return new;
end $$;

-- whether a file of this name and metadata keeps the caller's folder of the bookings bucket within its bytes. A file
-- that replaces one of the same name counts once. It reads storage.objects past row level security, so it is security
-- definer and tells only yes or no.
create function public.bookings_folder_fits(object_name text, object_metadata jsonb) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
      where o.bucket_id = 'bookings' and o.name like (select auth.uid())::text || '/%' and o.name <> object_name)
    + coalesce((object_metadata->>'size')::bigint, 0)
    <= (select value from public.owner_limits where name = 'bookings_folder_bytes'),
    true)
$$;
revoke all on function public.bookings_folder_fits(text, jsonb) from public, anon;
grant execute on function public.bookings_folder_fits(text, jsonb) to authenticated;

create policy bookings_folder_cap_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'bookings' or public.bookings_folder_fits(name, metadata));
create policy bookings_folder_cap_update on storage.objects as restrictive for update to authenticated
  using (true)
  with check (bucket_id <> 'bookings' or public.bookings_folder_fits(name, metadata));
