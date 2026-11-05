-- Finding accommodations at a stop (FEAT-003, TECH-004). Every Hostelworld request of the stay-rates edge function
-- first takes a turn from one gate here, 30 a minute across all callers, so the planner, the morning worker and the
-- search share the limit. A map place remembers its Hostelworld city, looked up by name once.

-- One row per Hostelworld request in the last minute, per site. Only the gate function reads or writes it.
create table if not exists public.site_calls (
  id bigint generated always as identity primary key,
  site text not null,
  at timestamptz not null default now()
);
create index if not exists site_calls_site_at on public.site_calls (site, at);
alter table public.site_calls enable row level security;

-- Takes a turn at the gate of a site. Returns 0 when the call may go now, after counting it, else the seconds until
-- the oldest call of the last minute leaves the window, at least 0.05. The advisory lock makes concurrent callers
-- of the same site wait for each other, so two of them cannot both take the last turn.
create or replace function public.take_site_call(p_site text, p_per_minute int)
returns double precision
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('site_calls:' || p_site));
  delete from public.site_calls where site = p_site and at < now() - interval '1 minute';
  select count(*), min(at) into v_count, v_oldest from public.site_calls where site = p_site;
  if v_count < p_per_minute then
    insert into public.site_calls (site) values (p_site);
    return 0;
  end if;
  return greatest(0.05, extract(epoch from (v_oldest + interval '1 minute' - now())));
end;
$$;

revoke execute on function public.take_site_call(text, int) from public, anon, authenticated;
grant execute on function public.take_site_call(text, int) to service_role;

-- The Hostelworld city of a map place. A null city_id means none was found, and the lookup is tried again after
-- 30 days. Only the function reads it, with the service role.
create table if not exists public.hostelworld_cities (
  place_id text primary key references public.places (id) on delete cascade,
  city_id text,
  city text,
  checked_at timestamptz not null default now()
);
alter table public.hostelworld_cities enable row level security;
