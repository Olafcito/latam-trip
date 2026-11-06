-- The stay_picks task (FEAT-004): when Simon first opens Add accommodation at a stop with nights and no Booking.com
-- place, the planner queues one task, and the cloud task runner adds three good value places from Booking.com. It is a
-- cloud type, so task_runs_in_cloud names it and the trigger of 0017 starts a run for it. The unique index makes one
-- task per place and dates certain, even when the phone and the laptop open the stop at the same moment. The app reads
-- the refusal of a second insert as already queued.

create or replace function public.task_runs_in_cloud(t text, d jsonb) returns boolean
language sql immutable as $$
  select coalesce(t, '') in ('question', 'lists_update', 'experience_research', 'stay_prices', 'stay_search', 'stay_picks', 'refresh')
     and (coalesce(t, '') <> 'refresh' or coalesce(d->>'scope', '') = 'experiences')
$$;

create unique index if not exists tasks_stay_picks_once
  on public.tasks ((data->>'place_id'), (data->>'check_in'), (data->>'check_out'))
  where type = 'stay_picks';

notify pgrst, 'reload schema';
