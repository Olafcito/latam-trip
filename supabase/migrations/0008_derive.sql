-- Triggers of spec 7.2 step 1. A write to a table the pipeline reads marks the build as due.
-- dirty_at moves on every write. dirty_since is set only when it is empty, so a long burst has an oldest unbuilt write.
-- trips and tasks have no trigger, as the apps read those directly.

create or replace function public.mark_dirty() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.derive_state set dirty_at = now(), dirty_since = coalesce(dirty_since, now()) where id = 1;
  return null;
end $$;

revoke execute on function public.mark_dirty() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['quotes','places','connections','profiles','place_images','experiences','experience_images',
                           'stays','task_log','inbox'] loop
    execute format('drop trigger if exists mark_dirty on public.%I', t);
    execute format('create trigger mark_dirty after insert or update or delete on public.%I
                    for each statement execute function public.mark_dirty()', t);
  end loop;
end $$;

-- documents: a row trigger with a when condition, as a statement trigger cannot see the row.
-- web_trips, way_id_map and unresolved_journeys are not read by the pipeline.
drop trigger if exists mark_dirty_write on public.documents;
create trigger mark_dirty_write after insert or update on public.documents
  for each row when (new.name not in ('web_trips', 'way_id_map', 'unresolved_journeys'))
  execute function public.mark_dirty();
drop trigger if exists mark_dirty_delete on public.documents;
create trigger mark_dirty_delete after delete on public.documents
  for each row when (old.name not in ('web_trips', 'way_id_map', 'unresolved_journeys'))
  execute function public.mark_dirty();

insert into public.leases (name) values ('build') on conflict (name) do nothing;

-- the apps listen to tasks and derive_state, as they already do to trips
do $$
declare t text;
begin
  foreach t in array array['tasks','derive_state'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
