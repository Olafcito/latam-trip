-- FEAT-006 phase 2: reading a booking confirmation calls the Claude API, so each person gets a number of reads a month.
-- read_booking_usage counts them by owner and month (UTC). take_read_booking(cap) takes one read for the signed in
-- caller and says whether it was under the cap. The read-booking function reads the cap from READ_BOOKING_MONTHLY_CAP.
-- The table is written only by the function, and no client reads it.

create table public.read_booking_usage (
  owner_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  reads integer not null default 0 check (reads >= 0),
  primary key (owner_id, month)
);
alter table public.read_booking_usage enable row level security;
revoke all on public.read_booking_usage from anon, authenticated;

create function public.take_read_booking(cap integer) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := auth.uid();
  n integer;
begin
  if who is null then
    raise exception 'take_read_booking needs a signed in caller' using errcode = '42501';
  end if;
  if cap is null or cap < 1 then
    return false;
  end if;
  insert into public.read_booking_usage as u (owner_id, month, reads)
    values (who, (date_trunc('month', now() at time zone 'utc'))::date, 1)
    on conflict (owner_id, month) do update set reads = u.reads + 1 where u.reads < cap
    returning reads into n;
  return n is not null;
end $$;

revoke execute on function public.take_read_booking(integer) from public, anon;
grant execute on function public.take_read_booking(integer) to authenticated, service_role;
