-- A stay_details task without dates is judged by the dates priced on every room (TECH-007). 0025 took the dates of
-- the lodging's latest price, so a newer price for other dates on only some rooms, such as a longer stay read for the
-- cheapest room, made a complete place look incomplete: Hotel Blu Sai and Alojamiento Disfruta San Andres stayed
-- open with every room priced for 3 to 6 December. Now the dates are the task's when it has both, else the dates
-- that have a price on every room of the lodging, the most recently seen of them when there are several. No such
-- dates means not complete. Only stay_details_dates changes. The functions of 0025 call it as before.

create or replace function public.stay_details_dates(p_lodging text, p_check_in date, p_check_out date,
                                                     out check_in date, out check_out date)
language plpgsql stable set search_path = public as $$
begin
  if p_check_in is not null and p_check_out is not null then
    check_in := p_check_in;
    check_out := p_check_out;
    return;
  end if;
  select p.check_in, p.check_out into check_in, check_out
  from public.lodging_prices p join public.lodging_rooms r on r.id = p.room_id
  where r.lodging_id = p_lodging
  group by p.check_in, p.check_out
  having count(distinct p.room_id) = (select count(*) from public.lodging_rooms x where x.lodging_id = p_lodging)
  order by max(p.observed_at) desc, p.check_in, p.check_out
  limit 1;
end $$;
revoke all on function public.stay_details_dates(text, date, date) from public, anon, authenticated;

-- The tasks this leaves complete, by the same check.
select public.close_stay_details(null);
