-- Open tasks start Claude by themselves (docs/task-runner.md). A new open task of a type that needs no browser and no
-- mailbox makes one POST to the fire endpoint of Simon's "Trip checklist on new tasks" routine, which starts a cloud
-- session that works through every such open task. The URL and the routine token live in Vault, never in this file.
-- Only the task id and its type are sent, never its data, since a booking task can hold booking details.
-- Several tasks saved at once make one call: a call is skipped when the last one went out under two minutes ago.
-- A sweep every half hour catches what the skip and a lost call leave open.

create extension if not exists pg_net with schema extensions;

create table if not exists public.task_runner (
  id int primary key default 1 check (id = 1),
  fired_at timestamptz
);
alter table public.task_runner enable row level security;
-- no policies: only the functions below, run as their owner, touch it
revoke all on public.task_runner from anon, authenticated;

-- the task types a cloud run handles, the rest wait for Simon's own checklist run
create or replace function public.task_runs_in_cloud(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') in ('question', 'lists_update', 'experience_research', 'place_research', 'stay_prices', 'stay_search', 'refresh')
$$;

create or replace function public.fire_task_runner(note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text;
  token text;
  last timestamptz;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'task_runner_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'task_runner_token';
  if url is null or token is null then return; end if;
  insert into public.task_runner (id) values (1) on conflict (id) do nothing;
  select fired_at into last from public.task_runner where id = 1 for update;
  if last is not null and last > now() - interval '2 minutes' then return; end if;
  update public.task_runner set fired_at = now() where id = 1;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || token, 'anthropic-version', '2023-06-01', 'Content-Type', 'application/json'),
    body := jsonb_build_object('text', note)
  );
end $$;
revoke all on function public.fire_task_runner(text) from public, anon, authenticated;

create or replace function public.ping_task_runner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'open' and public.task_runs_in_cloud(coalesce(new.type, new.data->>'type')) then
    perform public.fire_task_runner('task ' || new.id || ' ' || coalesce(new.type, new.data->>'type', ''));
  end if;
  return new;
end $$;
revoke all on function public.ping_task_runner() from public, anon, authenticated;

drop trigger if exists tasks_ping_runner on public.tasks;
create trigger tasks_ping_runner after insert on public.tasks
  for each row execute function public.ping_task_runner();

-- the sweep: a cloud task still open after ten minutes fires the routine again, at most every half hour
create or replace function public.sweep_task_runner() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tasks where status = 'open' and public.task_runs_in_cloud(coalesce(type, data->>'type'))
             and created_at < now() - interval '10 minutes') then
    perform public.fire_task_runner('sweep');
  end if;
end $$;
revoke all on function public.sweep_task_runner() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'sweep_task_runner';
  perform cron.schedule('sweep_task_runner', '*/30 * * * *', 'select public.sweep_task_runner()');
exception when others then
  raise notice 'pg_cron is not available, so the half hour sweep is not scheduled: %', sqlerrm;
end $$;
