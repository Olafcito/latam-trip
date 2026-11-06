-- Realtime per owner (TECH-012, the first gate of FEAT-006 phase 6). Postgres Changes does not apply row level
-- security to a DELETE, so every subscriber of a published table heard the old row's primary key, which carries the
-- owner's user id and, for trips, the trip name. The private tables leave the supabase_realtime publication and a
-- change is told on a private broadcast topic per owner instead, 'owner:<user id>'. The message is the table's name as
-- its event and the operation, and never a column of the row. The planner reads the rows again on it, as it already
-- did on every change. Row level security on realtime.messages lets a signed in person join their own topic only, and
-- no policy lets a client send, so only these triggers write to a topic. derive_state is shared and stays published.

-- one message per owner a statement touched, so a write of five hundred prices is one message and not five hundred
create function public.tell_owners() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owners uuid[];
  o uuid;
begin
  -- each trigger names only its own transition tables, so each branch reads only those
  if tg_op = 'DELETE' then
    select array_agg(distinct owner_id) into owners from gone;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct owner_id) into owners from (select owner_id from changed union all select owner_id from before) c;
  else
    select array_agg(distinct owner_id) into owners from changed;
  end if;
  foreach o in array coalesce(owners, '{}') loop
    if o is not null then
      perform realtime.send(jsonb_build_object('op', lower(tg_op)), tg_table_name, 'owner:' || o::text, true);
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.tell_owners() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['trips', 'bookings', 'lodgings', 'lodging_rooms', 'lodging_prices', 'tasks'] loop
    execute format('create trigger tell_owners_insert after insert on public.%I referencing new table as changed
                    for each statement execute function public.tell_owners()', t);
    execute format('create trigger tell_owners_update after update on public.%I
                    referencing old table as before new table as changed
                    for each statement execute function public.tell_owners()', t);
    execute format('create trigger tell_owners_delete after delete on public.%I referencing old table as gone
                    for each statement execute function public.tell_owners()', t);
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- a signed in person joins their own owner topic and no other
drop policy if exists owner_topic_read on realtime.messages;
create policy owner_topic_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and (select realtime.topic()) = 'owner:' || (select auth.uid())::text);
