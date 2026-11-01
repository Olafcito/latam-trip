-- Test helpers. Installed only by migrate.py --helpers, which refuses once the cutover_done document exists.
-- test_reset empties every data table and restarts the identities. It checks the same guard itself.

create or replace function public.test_reset() returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.documents where name = 'cutover_done') then
    raise exception 'cutover_done exists, test_reset refuses';
  end if;
  truncate public.quotes, public.trips, public.stays, public.connections, public.profiles, public.place_images,
    public.experience_images, public.experiences, public.places, public.airports, public.documents, public.inbox,
    public.tasks, public.task_log, public.agent_usage, public.leases, public.derived_options
    restart identity cascade;
  update public.derive_state set dirty_at = null, dirty_since = null, built_dirty_at = null, failed_dirty_at = null,
    last_started = null, last_finished = null, last_error = null, last_warning = null, manifest_hash = null, worker_version = null where id = 1;
end $$;

revoke execute on function public.test_reset() from public, anon, authenticated;
grant execute on function public.test_reset() to service_role;
