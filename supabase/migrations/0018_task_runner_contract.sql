-- The task runner starts only for the tasks a cloud run can do, the same list as CLOUD in latam_trip_mcp/runner.py
-- (a test keeps the two equal). The connector's claim_task decides what a run takes. This only decides when a run
-- starts. place_research and stay_search left the list: they need workers a cloud run does not have. refresh is
-- a cloud task only for experiences, so it needs the task's data as well as its type.

create or replace function public.task_runs_in_cloud(t text, d jsonb) returns boolean
language sql immutable as $$
  select coalesce(t, '') in ('question', 'lists_update', 'experience_research', 'stay_prices', 'refresh')
     and (coalesce(t, '') <> 'refresh' or coalesce(d->>'scope', '') = 'experiences')
$$;

create or replace function public.task_runs_in_cloud(t text) returns boolean
language sql immutable as $$
  select public.task_runs_in_cloud(t, '{}'::jsonb)
$$;

create or replace function public.ping_task_runner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'open' and public.task_runs_in_cloud(coalesce(new.type, new.data->>'type'), new.data) then
    perform public.fire_task_runner('task ' || new.id || ' ' || coalesce(new.type, new.data->>'type', ''));
  end if;
  return new;
end $$;
revoke all on function public.ping_task_runner() from public, anon, authenticated;

create or replace function public.sweep_task_runner() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tasks where status = 'open'
             and public.task_runs_in_cloud(coalesce(type, data->>'type'), data)
             and created_at < now() - interval '10 minutes') then
    perform public.fire_task_runner('sweep');
  end if;
end $$;
revoke all on function public.sweep_task_runner() from public, anon, authenticated;
