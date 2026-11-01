-- The planner listens to changes on trips (spec 6.2). Realtime only sends tables in this publication,
-- and it hands each change to a client only when row level security lets that client read the row.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips') then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;
