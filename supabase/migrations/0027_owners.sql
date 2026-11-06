-- FEAT-006 phase 2: every private row has an owner, and row level security keeps each person's rows to that person.
--
-- owners becomes admins. is_admin() says whether the caller is an admin, admin_id() gives the one admin and raises
-- unless there is exactly one. public.is_owner() stays as a wrapper of is_admin() until the connector stops using it.
--
-- Each private table gets owner_id uuid not null default coalesce(auth.uid(), public.admin_id()). A signed in person
-- writes their own rows, and a secret key write without owner_id (the worker, tripdb on the PC) lands on the admin.
-- The rows that exist are set to the admin, and a notice says how many per table.
--
-- A lodging, a room, a price and a booking are keyed (owner_id, id), so an id another person uses is as free as a fresh
-- one and a write never learns that it exists. Child tables carry the owner in their keys, so a room can only sit
-- under a lodging of the same owner and a price only under a room of the same owner. A key of someone else then fails
-- the same way as a key that does not exist. No other key points at these ids. bookings.lodging_id, bookings.room_id
-- and the lodging_id of a task's data are plain values, and every function that follows them matches on the owner.
--
-- The document split, checked against the live names on 2026-11-06. The live documents were bag_rules.json,
-- cutover_done, elevation.json, experience_categories.json, image_queries.json, known_prices.json, lists.json,
-- mcp_trash.json, scenarios.json, trip.json and way_id_map. A person's own documents move to user_documents, keyed
-- (owner_id, name): lists.json, trip.json, mcp_trash.json, web_trips, way_id_map, unresolved_journeys and
-- current_plan. web_trips, unresolved_journeys and current_plan were not live, they move when they appear. Every other
-- name stays in documents, shared and written by the admin only.
--
-- Catalogue tables are read by every signed in person and written by the admin. Service tables have no client policy.
-- owner_limits holds the per owner caps. Enforcing them comes in a later phase.

-- admins
alter table public.owners rename to admins;
alter table public.admins rename constraint owners_pkey to admins_pkey;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;

-- the default of every owner_id calls this for a write without a signed in user, so it never reveals the admin to one
create function public.admin_id() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  n int;
  who uuid;
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'admin_id is for the service and the admin' using errcode = '42501';
  end if;
  select count(*) into n from public.admins;
  if n <> 1 then
    raise exception 'admin_id needs exactly one admin, there are %', n using errcode = 'P0001';
  end if;
  select user_id into who from public.admins;
  return who;
end $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_admin() $$;

revoke execute on function public.is_admin(), public.admin_id() from public, anon;
grant execute on function public.is_admin(), public.admin_id() to authenticated, service_role;

-- owner_id on the private tables that exist, set to the admin. Triggers are off for the backfill, so no updated_at
-- moves and no task closes because of it.
do $$
declare
  t text;
  n bigint;
  adm uuid;
begin
  foreach t in array array['trips', 'bookings', 'lodgings', 'lodging_rooms', 'lodging_prices', 'quotes', 'tasks',
    'task_log', 'inbox', 'agent_usage', 'inbox_tokens'] loop
    execute format('alter table public.%I add column owner_id uuid', t);
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      adm := coalesce(adm, public.admin_id());
      execute format('alter table public.%I disable trigger user', t);
      execute format('update public.%I set owner_id = $1', t) using adm;
      execute format('alter table public.%I enable trigger user', t);
    end if;
    raise notice 'owner_id set to the admin on % rows of %', n, t;
    execute format('alter table public.%I alter column owner_id set default coalesce(auth.uid(), public.admin_id()), '
                   'alter column owner_id set not null, '
                   'add constraint %I foreign key (owner_id) references auth.users (id) on delete cascade',
                   t, t || '_owner_id_fkey');
  end loop;
end $$;

-- composite keys: each id is the owner's, a room under a lodging of its owner, a price under a room of its owner
alter table public.lodging_rooms drop constraint lodging_rooms_lodging_id_fkey;
alter table public.lodging_prices drop constraint lodging_prices_room_id_fkey;
alter table public.lodgings drop constraint lodgings_pkey, add primary key (owner_id, id);
alter table public.lodging_rooms
  drop constraint lodging_rooms_pkey,
  add primary key (owner_id, id),
  add constraint lodging_rooms_lodging_owner_fkey foreign key (owner_id, lodging_id)
    references public.lodgings (owner_id, id) on delete cascade;
alter table public.lodging_prices
  drop constraint lodging_prices_pkey,
  add primary key (owner_id, id),
  add constraint lodging_prices_room_owner_fkey foreign key (owner_id, room_id)
    references public.lodging_rooms (owner_id, id) on delete cascade;
alter table public.bookings drop constraint bookings_pkey, add primary key (owner_id, id);
drop index public.lodging_rooms_lodging_id;
drop index public.lodging_prices_room_id;
create index lodging_prices_room_id on public.lodging_prices (owner_id, room_id, check_in);

-- owner aware keys and indexes
alter table public.trips drop constraint trips_pkey, add primary key (owner_id, id, version);
alter table public.quotes drop constraint quotes_quote_id_key, add constraint quotes_owner_quote_id_key unique (owner_id, quote_id);
drop index public.tasks_stay_picks_once;
create unique index tasks_stay_picks_once on public.tasks
  (owner_id, (data->>'place_id'), (data->>'check_in'), (data->>'check_out')) where type = 'stay_picks';
drop index public.lodging_rooms_site;
create unique index lodging_rooms_site on public.lodging_rooms (owner_id, lodging_id, site, site_id);
create index tasks_owner_id on public.tasks (owner_id);
create index task_log_owner_id on public.task_log (owner_id);
create index inbox_owner_id on public.inbox (owner_id);
create index agent_usage_owner_id on public.agent_usage (owner_id);

-- the newest version of each of a person's trips, only for its owner (security_invoker), owner_id last
create or replace view public.trips_latest with (security_invoker = true) as
  select distinct on (t.owner_id, t.id) t.id, t.version, t.seq, t.saved_at, t.saved_by, t.deleted_at, t.data, t.owner_id
  from public.trips t
  where not exists (select 1 from public.trips d where d.owner_id = t.owner_id and d.id = t.id and d.deleted_at is not null)
  order by t.owner_id, t.id, t.version desc;

-- a person's documents
create table public.user_documents (
  owner_id uuid not null default coalesce(auth.uid(), public.admin_id()) references auth.users (id) on delete cascade,
  name text not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  data jsonb not null,
  primary key (owner_id, name)
);

do $$
declare
  personal text[] := array['lists.json', 'trip.json', 'mcp_trash.json', 'web_trips', 'way_id_map',
                           'unresolved_journeys', 'current_plan'];
  n bigint;
begin
  select count(*) into n from public.documents where name = any(personal);
  if n > 0 then
    insert into public.user_documents (owner_id, name, version, updated_at, data)
      select public.admin_id(), name, version, updated_at, data from public.documents where name = any(personal);
    delete from public.documents where name = any(personal);
  end if;
  raise notice 'owner_id set to the admin on % rows of user_documents, moved from documents', n;
end $$;

-- the admin's documents feed the build as they did in documents, the generated ones do not
create function public.mark_dirty_admin_doc() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.admins
             where user_id = case when tg_op = 'DELETE' then old.owner_id else new.owner_id end) then
    update public.derive_state set dirty_at = now(), dirty_since = coalesce(dirty_since, now()) where id = 1;
  end if;
  return null;
end $$;
revoke execute on function public.mark_dirty_admin_doc() from public, anon, authenticated;
create trigger mark_dirty_write after insert or update on public.user_documents
  for each row when (new.name not in ('web_trips', 'way_id_map', 'unresolved_journeys'))
  execute function public.mark_dirty_admin_doc();
create trigger mark_dirty_delete after delete on public.user_documents
  for each row when (old.name not in ('web_trips', 'way_id_map', 'unresolved_journeys'))
  execute function public.mark_dirty_admin_doc();

-- a person's profile, read by the skills in a later phase
create table public.user_profiles (
  owner_id uuid primary key default coalesce(auth.uid(), public.admin_id()) references auth.users (id) on delete cascade,
  home_airport text,
  currency text,
  max_hours numeric check (max_hours > 0),
  travel_style text,
  rules text,
  updated_at timestamptz not null default now()
);
create trigger touch_updated_at before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- the per owner caps (FEAT-006 finding 12), one row each so they change without a migration
create table public.owner_limits (
  name text primary key,
  value bigint not null check (value >= 0),
  unit text not null
);
insert into public.owner_limits (name, value, unit) values
  ('rows_per_private_table', 2000, 'rows'),
  ('tasks_per_day', 100, 'tasks'),
  ('bookings_folder_bytes', 209715200, 'bytes'),
  ('connector_writes_per_minute', 60, 'writes');

-- definer functions that write rows name the owner
create or replace function public.save_trip(trip jsonb) returns jsonb
language plpgsql set search_path = public
as $$
declare
  tid text := trip->>'id';
  me uuid := coalesce(auth.uid(), public.admin_id());
  prev public.trips;
  v int;
  stamp timestamptz := now();
  doc jsonb;
begin
  if tid is null or tid = '' then
    raise exception 'trip has no id';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trip:' || me || ':' || tid, 0));
  if exists (select 1 from public.trips where owner_id = me and id = tid and deleted_at is not null) then
    raise exception 'trip % was deleted', tid;
  end if;
  select * into prev from public.trips where owner_id = me and id = tid order by version desc limit 1;
  if found and (prev.data - 'version' - 'saved_at' - 'by') = (trip - 'version' - 'saved_at' - 'by') then
    return jsonb_build_object('id', tid, 'version', prev.version, 'skipped', true);
  end if;
  v := coalesce(prev.version, 0) + 1;
  doc := trip || jsonb_build_object('version', v,
                                    'saved_at', to_char(stamp at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  insert into public.trips (owner_id, id, version, saved_at, saved_by, data) values (me, tid, v, stamp, doc->>'by', doc);
  return jsonb_build_object('id', tid, 'version', v, 'skipped', false);
end;
$$;

create or replace function public.add_quotes(rows jsonb) returns jsonb
language plpgsql set search_path = public
as $$
declare
  n_added int;
  n_seen int;
begin
  with src as (
    select o.ord, q.*
    from jsonb_array_elements(rows) with ordinality as o(elem, ord),
         lateral jsonb_populate_record(null::public.quotes, o.elem) q
  ),
  grp as (
    select distinct on (quote_id) s.*, count(*) over (partition by quote_id) as n
    from src s
    order by quote_id, last_seen desc nulls last, ord
  ),
  stubs as (
    insert into public.airports (code)
    select distinct c from grp, unnest(array[first_from, first_to, last_from, last_to]) as c
    where c is not null
    on conflict do nothing
  ),
  ins as (
    insert into public.quotes (quote_id, build_qid, agent, task_id, source, structure, first_seen, last_seen, seen_count,
      first_from, first_to, last_from, last_to, first_date, last_date, price, currency, price_dkk, tickets, self_transfer,
      us_transit, out_hours, home_hours, usable, flags, fare_brand, cabin_bag, checked_bag, changeable, link, notes, trip_name,
      legs_requested, out_leg, mid_legs, home_leg, extra)
    select quote_id, build_qid, agent, task_id, source, structure, coalesce(first_seen, last_seen), last_seen, n::int,
      first_from, first_to, last_from, last_to, first_date, last_date, price, currency, price_dkk, tickets, self_transfer,
      us_transit, out_hours, home_hours, usable, flags, fare_brand, cabin_bag, checked_bag, changeable, link, notes, trip_name,
      legs_requested, out_leg, mid_legs, home_leg, coalesce(extra, '{}'::jsonb)
    from grp
    order by quote_id
    on conflict (owner_id, quote_id) do update set
      last_seen = greatest(quotes.last_seen, excluded.last_seen),
      seen_count = quotes.seen_count + excluded.seen_count
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_added, n_seen from ins;
  return jsonb_build_object('added', n_added, 'seen_again', n_seen);
end $$;

-- a token belongs to a person, and what comes in through it is theirs
create or replace function public.submit_inbox(token text, file text, rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid;
begin
  select t.owner_id into who from public.inbox_tokens t
  where t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex');
  if token is null or who is null then
    raise exception 'invalid inbox token' using errcode = '28000';
  end if;
  if rows is null or pg_catalog.jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  insert into public.inbox (owner_id, file, status, rows) values (who, pg_catalog.left(file, 200), 'new', rows);
  return pg_catalog.jsonb_array_length(rows);
end;
$$;

create or replace function public.submit_task(token text, task jsonb) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  tid bigint;
  kind text;
  who uuid;
begin
  select t.owner_id into who from public.inbox_tokens t
  where t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex');
  if token is null or who is null then
    raise exception 'invalid inbox token' using errcode = '28000';
  end if;
  if task is null or pg_catalog.jsonb_typeof(task) <> 'object' then
    raise exception 'task must be a json object' using errcode = '22023';
  end if;
  kind := task ->> 'type';
  if kind is null or kind not in ('fix_parser', 'import_quotes') then
    raise exception 'a userscript task is fix_parser or import_quotes, not %', kind using errcode = '22023';
  end if;
  insert into public.tasks (owner_id, type, title, data)
    values (who, kind, pg_catalog.left(coalesce(task ->> 'title', '[' || kind || ']'), 300), task)
    returning id into tid;
  return tid;
end $$;

-- a lodging's stay_details task is its owner's
create or replace function public.queue_stay_details() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not new.hidden
     and exists (select 1 from jsonb_array_elements(new.links) l where l->>'site' in ('booking', 'airbnb'))
     and not exists (select 1 from public.tasks t
                     where t.owner_id = new.owner_id
                       and coalesce(t.type, t.data->>'type') = 'stay_details'
                       and t.status in ('open', 'working') and t.data->>'lodging_id' = new.id) then
    insert into public.tasks (owner_id, type, title, status, data)
    values (new.owner_id, 'stay_details', '[stay_details] ' || new.name, 'open',
            jsonb_build_object('type', 'stay_details', 'lodging_id', new.id, 'from', 'lodging'));
  end if;
  return new;
end $$;

-- The functions of 0025 and 0026 that judge a lodging by its id take its owner too, so a task, a room or a price only
-- ever meets the lodging of its own owner, even when another person uses the same id.
drop function public.close_stay_details(text);
drop function public.stay_details_complete(text, date, date);
drop function public.stay_details_dates(text, date, date);

create function public.stay_details_dates(p_owner uuid, p_lodging text, p_check_in date, p_check_out date,
                                          out check_in date, out check_out date)
language plpgsql stable set search_path = public as $$
begin
  if p_check_in is not null and p_check_out is not null then
    check_in := p_check_in;
    check_out := p_check_out;
    return;
  end if;
  select p.check_in, p.check_out into check_in, check_out
  from public.lodging_prices p join public.lodging_rooms r on r.owner_id = p.owner_id and r.id = p.room_id
  where r.owner_id = p_owner and r.lodging_id = p_lodging
  group by p.check_in, p.check_out
  having count(distinct p.room_id) = (select count(*) from public.lodging_rooms x
                                      where x.owner_id = p_owner and x.lodging_id = p_lodging)
  order by max(p.observed_at) desc, p.check_in, p.check_out
  limit 1;
end $$;
revoke all on function public.stay_details_dates(uuid, text, date, date) from public, anon, authenticated;

create function public.stay_details_complete(p_owner uuid, p_lodging text, p_check_in date, p_check_out date)
returns boolean
language plpgsql stable set search_path = public as $$
declare
  d record;
begin
  select * into d from public.stay_details_dates(p_owner, p_lodging, p_check_in, p_check_out);
  if d.check_in is null or d.check_out is null then
    return false;
  end if;
  return exists (select 1 from public.lodgings l
                 where l.owner_id = p_owner and l.id = p_lodging and jsonb_array_length(l.photos) > 0)
     and exists (select 1 from public.lodging_rooms r where r.owner_id = p_owner and r.lodging_id = p_lodging)
     and not exists (select 1 from public.lodging_rooms r
                     where r.owner_id = p_owner and r.lodging_id = p_lodging
                       and not exists (select 1 from public.lodging_prices p
                                       where p.owner_id = r.owner_id and p.room_id = r.id
                                         and p.check_in = d.check_in and p.check_out = d.check_out));
end $$;
revoke all on function public.stay_details_complete(uuid, text, date, date) from public, anon, authenticated;

-- Closes the complete open or working stay_details tasks of one owner's lodging, of every lodging of one owner when
-- p_lodging is null, or of everyone when both are null. A task is judged by the lodging of its own owner only, so a
-- task naming someone else's lodging learns nothing from its result.
create function public.close_stay_details(p_lodging text, p_owner uuid default null) returns integer
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
           order by k.id
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
     where id = t.id and status in ('open', 'working');
    get diagnostics hit = row_count;
    closed := closed + hit;
  end loop;
  return closed;
end $$;
revoke all on function public.close_stay_details(text, uuid) from public, anon, authenticated;

-- the trigger of 0025 finds the changed row's lodging among the rows of the same owner
create or replace function public.stay_details_follow_data() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lid text;
  who uuid;
begin
  if tg_table_name = 'lodgings' then
    lid := new.id;
    who := new.owner_id;
  elsif tg_table_name = 'lodging_rooms' then
    if tg_op = 'DELETE' then
      lid := old.lodging_id;
      who := old.owner_id;
    else
      lid := new.lodging_id;
      who := new.owner_id;
      if tg_op = 'UPDATE' and (old.lodging_id, old.owner_id) is distinct from (new.lodging_id, new.owner_id) then
        perform public.close_stay_details(old.lodging_id, old.owner_id);
      end if;
    end if;
  else
    who := new.owner_id;
    select r.lodging_id into lid from public.lodging_rooms r where r.owner_id = new.owner_id and r.id = new.room_id;
  end if;
  if lid is not null then
    perform public.close_stay_details(lid, who);
  end if;
  return null;
end $$;
revoke all on function public.stay_details_follow_data() from public, anon, authenticated;

-- the cloud runner acts with the secret key, so it wakes only for the admin's tasks (finding 3)
create or replace function public.ping_task_runner() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'open' and exists (select 1 from public.admins where user_id = new.owner_id)
     and public.task_runs_in_cloud(coalesce(new.type, new.data->>'type'), new.data) then
    perform public.fire_task_runner('task ' || new.id || ' ' || coalesce(new.type, new.data->>'type', ''));
  end if;
  return new;
end $$;

create or replace function public.sweep_task_runner() returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.tasks
             where owner_id in (select user_id from public.admins)
               and public.task_runs_in_cloud(coalesce(type, data->>'type'), data)
               and ((status = 'open' and created_at < now() - interval '10 minutes')
                 or (status = 'working' and claimed_at < now() - interval '3 hours'))) then
    perform public.fire_task_runner('sweep');
  end if;
end $$;

-- policies: every old one goes, then each table gets the rule of its kind
do $$
declare
  r record;
  t text;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array array['trips', 'bookings', 'lodgings', 'lodging_rooms', 'lodging_prices', 'quotes', 'tasks',
    'task_log', 'inbox', 'agent_usage', 'user_profiles', 'user_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated '
                   'using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;

  foreach t in array array['airports', 'places', 'connections', 'profiles', 'place_images', 'experiences',
    'experience_images', 'documents'] loop
    execute format('create policy catalogue_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated '
                   'with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated '
                   'using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated '
                   'using ((select public.is_admin()))', t);
  end loop;

  create policy state_read on public.derive_state for select to authenticated using (true);

  -- service tables: row level security on, no policy, so only the secret key reaches them
  foreach t in array array['admins', 'inbox_tokens', 'leases', 'derived_options', 'stays', 'site_calls',
    'hostelworld_cities', 'task_runner', 'schema_migrations', 'owner_limits'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- the signed out key touches none of the new tables, as 0002 set for the rest
revoke all on public.user_documents, public.user_profiles, public.owner_limits from anon;
revoke all on public.owner_limits from authenticated;
