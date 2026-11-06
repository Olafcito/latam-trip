-- FEAT-006 phase 2: the private bookings bucket is per person. A file lives at <owner id>/<booking id>/<file>, and a
-- signed in person reads and writes only under the folder named by their own user id.
--
-- The files stored before this live at <booking id>/<file>. SQL cannot move them, as Storage keys its objects by name,
-- so supabase/move_booking_files.py moves them through the Storage API to <admin id>/<booking id>/<file> and points
-- the bookings rows at the new paths. Until a later migration drops it, the admin keeps the old one folder paths, so
-- the files and the planner of before the release keep working until the move has run.

drop policy if exists bookings_owner_select on storage.objects;
drop policy if exists bookings_owner_insert on storage.objects;
drop policy if exists bookings_owner_update on storage.objects;
drop policy if exists bookings_owner_delete on storage.objects;

create policy bookings_own_select on storage.objects for select to authenticated
  using (bucket_id = 'bookings' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (array_length(storage.foldername(name), 1) = 1 and (select public.is_admin()))));
create policy bookings_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bookings' and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (array_length(storage.foldername(name), 1) = 1 and (select public.is_admin()))));
create policy bookings_own_update on storage.objects for update to authenticated
  using (bucket_id = 'bookings' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (array_length(storage.foldername(name), 1) = 1 and (select public.is_admin()))))
  with check (bucket_id = 'bookings' and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (array_length(storage.foldername(name), 1) = 1 and (select public.is_admin()))));
create policy bookings_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bookings' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (array_length(storage.foldername(name), 1) = 1 and (select public.is_admin()))));
