-- The stay_search task, the Booking.com half of the app's press that finds places to stay, joins the types a cloud run
-- takes, the same list as CLOUD in latam_trip_mcp/runner.py (a test keeps the newest list and CLOUD equal). The function
-- is 0018's with the type added. Its one argument form, the trigger and the sweep need no change.

create or replace function public.task_runs_in_cloud(t text, d jsonb) returns boolean
language sql immutable as $$
  select coalesce(t, '') in ('question', 'lists_update', 'experience_research', 'stay_prices', 'stay_search', 'refresh')
     and (coalesce(t, '') <> 'refresh' or coalesce(d->>'scope', '') = 'experiences')
$$;

notify pgrst, 'reload schema';
