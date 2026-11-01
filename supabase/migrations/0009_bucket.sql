-- The public bucket the worker uploads built files to (spec 7.2 step 7). Anyone may read, only the secret key writes.
-- The repo is public and the files are derived from public data, so a public bucket adds no exposure.
insert into storage.buckets (id, name, public, file_size_limit)
values ('web', 'web', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;
