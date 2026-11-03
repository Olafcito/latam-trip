-- The bookings of spec 4.1, one row per leg or stay, and the private bucket for their files.
-- The repo and the web bucket are public. Booking references, prices paid, names and attachments live only here,
-- behind the owner only rule, and never in a built file. So this table has no mark_dirty trigger, like trips.

create table public.bookings (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('flight', 'bus', 'boat', 'stay', 'other')),
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  from_code text,
  to_code text,
  depart text,
  arrive text,
  place_id text,
  check_in date,
  check_out date,
  lodging_id text,
  room_id text,
  reference text,
  seller text,
  url text,
  price_dkk numeric,
  price numeric,
  currency text,
  refundable text check (refundable in ('yes', 'no', 'partly')),
  changeable text check (changeable in ('yes', 'no', 'fee')),
  change_until date,
  cancel_until date,
  cabin_bag text,
  checked_bag text,
  segments jsonb,
  travellers int not null default 1,
  trip_id text,
  ticket text,
  source text check (source in ('picked', 'manual', 'claude')),
  notes text,
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at follows every update, whoever writes the row.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger touch_updated_at before update on public.bookings
  for each row execute function public.touch_updated_at();

-- Only the one owner account gets in, as in 0002_rls.sql. The secret key bypasses it.
-- New tables are granted to anon by default, so the grant is taken back here.
alter table public.bookings enable row level security;
create policy owner_all on public.bookings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.bookings from anon;

-- The planner reads bookings live, like trips in 0007_realtime_trips.sql.
-- Realtime hands a change to a client only when row level security lets that client read the row.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

-- The private bucket for tickets and confirmations, path <booking id>/<file name>, opened with short lived signed URLs.
-- Files up to 10 MB, PDF and the image types a phone camera gives.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bookings', 'bookings', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

-- Only the owner reads or writes the bucket's files. Nothing is granted to anon.
create policy bookings_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'bookings' and (select public.is_owner()));
create policy bookings_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bookings' and (select public.is_owner()));
create policy bookings_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'bookings' and (select public.is_owner()))
  with check (bucket_id = 'bookings' and (select public.is_owner()));
create policy bookings_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bookings' and (select public.is_owner()));
