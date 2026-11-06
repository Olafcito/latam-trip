-- FEAT-006 phase 2: the private bookings bucket is per person. A file lives at <owner id>/<booking id>/<file>, and a
-- signed in person reads and writes only under the folder named by their own user id.
--
-- The files stored before this live at <booking id>/<file>. SQL cannot move them, as Storage keys its objects by name,
-- so supabase/move_booking_files.py moves them through the Storage API to <admin id>/<booking id>/<file> and points
-- the bookings rows at the new paths. Until a later migration drops it, the admin keeps the old one folder paths, so
-- the files and the planner of before the release keep working until the move has run. Only a folder named by one of
-- the caller's own bookings counts as an old path, so a folder named by another person's user id or booking id is
-- never one.

drop policy if exists bookings_owner_select on storage.objects;
drop policy if exists bookings_owner_insert on storage.objects;
drop policy if exists bookings_owner_update on storage.objects;
drop policy if exists bookings_owner_delete on storage.objects;

-- whether the caller may reach this object of the bookings bucket: under their own folder, or for the admin, at an old
-- path <booking id>/<file> of one of the admin's own bookings
create function public.bookings_file_allowed(object_name text) returns boolean
language sql stable set search_path = public as $$
  select (storage.foldername(object_name))[1] = (select auth.uid())::text
      or (array_length(storage.foldername(object_name), 1) = 1 and (select public.is_admin())
          and exists (select 1 from public.bookings b
                      where b.owner_id = (select auth.uid()) and b.id = (storage.foldername(object_name))[1]))
$$;
revoke all on function public.bookings_file_allowed(text) from public, anon;
grant execute on function public.bookings_file_allowed(text) to authenticated;

create policy bookings_own_select on storage.objects for select to authenticated
  using (bucket_id = 'bookings' and public.bookings_file_allowed(name));
create policy bookings_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bookings' and public.bookings_file_allowed(name));
create policy bookings_own_update on storage.objects for update to authenticated
  using (bucket_id = 'bookings' and public.bookings_file_allowed(name))
  with check (bucket_id = 'bookings' and public.bookings_file_allowed(name));
create policy bookings_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bookings' and public.bookings_file_allowed(name));
