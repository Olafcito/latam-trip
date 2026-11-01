-- reset_identity moves the identity sequence of table.col past the highest value, so a restored table hands out fresh ids.
-- Only the secret key may call it. An empty table goes back to the start of its sequence.
create or replace function public.reset_identity(tbl text, col text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  seq text;
  top bigint;
  low bigint;
begin
  if tbl not in ('places', 'connections', 'profiles', 'place_images', 'experiences', 'experience_images', 'stays', 'quotes',
                 'trips', 'inbox', 'tasks', 'task_log', 'agent_usage') then
    raise exception 'reset_identity: % is not a table with an identity', tbl;
  end if;
  seq := pg_get_serial_sequence(format('public.%I', tbl), col);
  if seq is null then
    raise exception 'reset_identity: %.% has no identity', tbl, col;
  end if;
  execute format('select coalesce(max(%I), 0) from public.%I', col, tbl) into top;
  select seqmin into low from pg_sequence where seqrelid = seq::regclass;
  if top < low then
    perform setval(seq, low, false);
  else
    perform setval(seq, top, true);
  end if;
end $$;

revoke execute on function public.reset_identity(text, text) from public, anon, authenticated;
grant execute on function public.reset_identity(text, text) to service_role;
