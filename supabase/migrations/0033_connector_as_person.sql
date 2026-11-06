-- The connector calls Supabase as the signed in person and holds no secret key (TECH-010). Two things it reached
-- before only through that key now work for every signed in person, each within their own rows.
--
-- add_quotes. It stays security invoker, so the own_rows policy of 0027 on quotes holds inside it, and it is granted
-- to authenticated. owner_id is never read from the payload: the insert names it as auth.uid(), or the one admin when
-- the secret key calls (the worker and tripdb), so a person can only write and bump their own quotes.
--
-- Airport stubs. quotes.first_from, first_to, last_from and last_to reference airports (code), and airports is a
-- catalogue table that only the admin writes. add_airport_stubs is the one narrow way past that: security definer,
-- it inserts a missing code and nothing else, never changes or deletes a row, and for a person who is not the admin
-- it takes only three capital letters, at most 200 in one call. The admin and the secret key keep the old rule.
--
-- stays. It holds crawled prices with no owner, so it becomes a catalogue table like the others in 0027: read by every
-- signed in person, written by the admin. Before, it had no policy and the connector could not see a row of it.

create function public.add_airport_stubs(codes text[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if codes is null or pg_catalog.cardinality(codes) = 0 then
    return 0;
  end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    if pg_catalog.cardinality(codes) > 200 then
      raise exception 'at most 200 airport codes in one call' using errcode = '22023';
    end if;
    if exists (select 1 from pg_catalog.unnest(codes) as c where c is not null and c !~ '^[A-Z]{3}$') then
      raise exception 'an airport code is three capital letters' using errcode = '22023';
    end if;
  end if;
  insert into public.airports (code)
  select distinct c from pg_catalog.unnest(codes) as c where c is not null
  on conflict (code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.add_airport_stubs(text[]) from public, anon;
grant execute on function public.add_airport_stubs(text[]) to authenticated, service_role;

create or replace function public.add_quotes(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  n_added int;
  n_seen int;
  me uuid := coalesce((select auth.uid()), public.admin_id());
begin
  perform public.add_airport_stubs(array(
    select distinct c
    from jsonb_array_elements(rows) as e,
         unnest(array[e->>'first_from', e->>'first_to', e->>'last_from', e->>'last_to']) as c
    where c is not null));
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
  ins as (
    insert into public.quotes (owner_id, quote_id, build_qid, agent, task_id, source, structure, first_seen, last_seen,
      seen_count, first_from, first_to, last_from, last_to, first_date, last_date, price, currency, price_dkk, tickets,
      self_transfer, us_transit, out_hours, home_hours, usable, flags, fare_brand, cabin_bag, checked_bag, changeable, link,
      notes, trip_name, legs_requested, out_leg, mid_legs, home_leg, extra)
    select me, quote_id, build_qid, agent, task_id, source, structure, coalesce(first_seen, last_seen), last_seen, n::int,
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

revoke execute on function public.add_quotes(jsonb) from public, anon;
grant execute on function public.add_quotes(jsonb) to authenticated, service_role;

create policy catalogue_read on public.stays for select to authenticated using (true);
create policy admin_insert on public.stays for insert to authenticated with check ((select public.is_admin()));
create policy admin_update on public.stays for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_delete on public.stays for delete to authenticated using ((select public.is_admin()));
