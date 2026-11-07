-- FEAT-007, sharing a trip by a link.
--
-- trip_shares holds one row per link a person made for one of their trips. The token is the link, made by share_trip
-- from 16 random bytes and written url safe without padding, so 22 characters and 128 bits. A client never inserts a
-- row itself, so every token is one share_trip made. A person has at most one live link per trip, and share_trip hands
-- that one back. stop_sharing marks the live link revoked, and sharing again makes a new token, so an old link stays dead.
--
-- shared_trip(token) is how anyone else reads a shared trip. It is granted to signed in people only, and it answers
-- with the latest version of the trip while the link is live and no version of the trip is deleted, else null. It
-- answers with the plan alone, built from a list of keys: the name, the why, the ways and tickets, which are market
-- fares, and each place with its hop, nights and dates. It leaves out who saved it (by), the totals, which hold the
-- prices of booked stays, and each place's stay and stays, which name the owner's private lodgings. It never reads
-- bookings, lodgings or quotes, and it never names the owner.
--
-- Every row has owner_id and cascades with the auth user, so delete_account (0037) takes the links too, and the
-- connector's export reads them through the select policy. The row cap of 0035 holds the table as every other private
-- table, through rows_per_private_table.

create table public.trip_shares (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{22,}$'),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id text not null check (length(trip_id) between 1 and 200),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index trip_shares_live on public.trip_shares (owner_id, trip_id) where revoked_at is null;

alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from anon, authenticated;
grant select on public.trip_shares to authenticated;
grant update (revoked_at) on public.trip_shares to authenticated;
create policy own_select on public.trip_shares for select to authenticated
  using (owner_id = (select auth.uid()));
-- a link the owner revokes stays revoked: the new row must keep a revoked_at
create policy own_revoke on public.trip_shares for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and revoked_at is not null);

create trigger hold_owner_caps after insert on public.trip_shares referencing new table as changed
  for each statement execute function public.hold_owner_caps();

-- the caller's live link for the trip, made when there is none. It refuses a trip the caller has no version of, and a
-- trip the caller deleted.
create function public.share_trip(trip_id text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  tid text := share_trip.trip_id;
  tok text;
begin
  if me is null then
    raise exception using errcode = '42501', message = 'Sign in first, a trip is shared by its own person only.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trip:' || me || ':' || tid, 0));
  if not exists (select 1 from public.trips where owner_id = me and id = tid) then
    raise exception using errcode = 'P0002', message = format('There is no trip %s to share.', tid);
  end if;
  if exists (select 1 from public.trips where owner_id = me and id = tid and deleted_at is not null) then
    raise exception using errcode = 'P0001', message = format('The trip %s was deleted, so it cannot be shared.', tid);
  end if;
  select s.token into tok from public.trip_shares s where s.owner_id = me and s.trip_id = tid and s.revoked_at is null;
  if tok is null then
    tok := translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
    insert into public.trip_shares (token, owner_id, trip_id) values (tok, me, tid);
  end if;
  return tok;
end $$;
revoke execute on function public.share_trip(text) from public, anon;
grant execute on function public.share_trip(text) to authenticated;

-- revokes the caller's live link for the trip. It answers whether there was one.
create function public.stop_sharing(trip_id text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then
    raise exception using errcode = '42501', message = 'Sign in first, a trip is shared by its own person only.';
  end if;
  update public.trip_shares s set revoked_at = now()
    where s.owner_id = me and s.trip_id = stop_sharing.trip_id and s.revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.stop_sharing(text) from public, anon;
grant execute on function public.stop_sharing(text) to authenticated;

-- the trip a live link shows, as the plan alone, or null
create function public.shared_trip(token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s record;
  d jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;
  select x.owner_id, x.trip_id into s from public.trip_shares x where x.token = shared_trip.token and x.revoked_at is null;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.trips t where t.owner_id = s.owner_id and t.id = s.trip_id and t.deleted_at is not null) then
    return null;
  end if;
  select t.data into d from public.trips t where t.owner_id = s.owner_id and t.id = s.trip_id
    order by t.version desc limit 1;
  if d is null then
    return null;
  end if;
  return (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(d) as e(k, v)
    where k in ('id', 'version', 'name', 'saved_at', 'why', 'rank', 'option_id', 'way_in', 'way_home', 'tickets', 'lastNights')
  ) || jsonb_build_object('places', (
    select coalesce(jsonb_agg((
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p) as f(k, v)
      where k in ('node', 'hop', 'why', 'nights', 'arrive', 'depart')
    ) order by i), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(d->'places') = 'array' then d->'places' else '[]'::jsonb end)
      with ordinality as a(p, i)
  ));
end $$;
revoke execute on function public.shared_trip(text) from public, anon;
grant execute on function public.shared_trip(text) to authenticated;
