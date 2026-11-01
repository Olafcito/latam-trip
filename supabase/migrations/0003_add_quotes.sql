-- add_quotes(rows jsonb): one call writes a batch of quotes whose computed fields are already on each row.
-- A repeat in the batch or in the table moves only last_seen and seen_count. It also makes airport stubs.

create function public.add_quotes(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  n_added int;
  n_seen int;
begin
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
  stubs as (
    insert into public.airports (code)
    select distinct c from grp, unnest(array[first_from, first_to, last_from, last_to]) as c
    where c is not null
    on conflict do nothing
  ),
  ins as (
    insert into public.quotes (quote_id, build_qid, agent, task_id, source, structure, first_seen, last_seen, seen_count,
      first_from, first_to, last_from, last_to, first_date, last_date, price, currency, price_dkk, tickets, self_transfer,
      us_transit, out_hours, home_hours, usable, flags, fare_brand, cabin_bag, checked_bag, changeable, link, notes, trip_name,
      legs_requested, out_leg, mid_legs, home_leg, extra)
    select quote_id, build_qid, agent, task_id, source, structure, coalesce(first_seen, last_seen), last_seen, n::int,
      first_from, first_to, last_from, last_to, first_date, last_date, price, currency, price_dkk, tickets, self_transfer,
      us_transit, out_hours, home_hours, usable, flags, fare_brand, cabin_bag, checked_bag, changeable, link, notes, trip_name,
      legs_requested, out_leg, mid_legs, home_leg, coalesce(extra, '{}'::jsonb)
    from grp
    order by quote_id
    on conflict (quote_id) do update set
      last_seen = greatest(quotes.last_seen, excluded.last_seen),
      seen_count = quotes.seen_count + excluded.seen_count
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_added, n_seen from ins;
  return jsonb_build_object('added', n_added, 'seen_again', n_seen);
end $$;

revoke execute on function public.add_quotes(jsonb) from public, anon, authenticated;
grant execute on function public.add_quotes(jsonb) to service_role;
