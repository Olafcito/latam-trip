-- FEAT-006 task 6.3 and the connector line of 6.2.
--
-- delete_account(p_email) deletes the signed in person's account and every row they own. The person types their own
-- email, and it must match the email the account signs in with, in any case. The admin cannot delete themselves this
-- way. The caller's working tasks are failed first, then the auth user is deleted and the owner_id foreign keys take
-- every row with it. Each of them cascades (0027, 0029, 0035 and connector_writes here), so no key changes here, and
-- the block at the end fails the migration if one ever does not. The connector asks may_delete_account first, then
-- removes the person's files from the bookings bucket through the Storage API under their own token, and
-- delete_account refuses while a file is left there, so a failed removal deletes nothing and a retry works. The
-- invite of the account's own email (0036) has no owner_id and no key to auth.users, so delete_account deletes it by
-- the email before the auth user goes, and signing up again needs a fresh invite. The reply counts the rows each
-- owner_id table held.
--
-- connector_call(p_write) runs before every connector tool. A deleted account is refused with a plain message, so an
-- old token fails cleanly. A write counts against connector_writes_per_minute (0027) per person and UTC minute, and the
-- one past the limit is refused. The count is kept in connector_writes, which no client reads or writes. The function
-- counts the caller only, and a refused write takes its count back with it.

create table public.connector_writes (
  owner_id uuid not null references auth.users (id) on delete cascade,
  minute timestamptz not null,
  writes integer not null default 0 check (writes >= 0),
  primary key (owner_id, minute)
);
alter table public.connector_writes enable row level security;
revoke all on public.connector_writes from anon, authenticated;

create function public.connector_call(p_write boolean) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  this_minute timestamptz := date_trunc('minute', now());
  cap bigint;
  n integer;
begin
  if me is null then
    raise exception using errcode = '42501', message = 'Sign in again, the connector answers a signed in person only.';
  end if;
  if not exists (select 1 from auth.users where id = me) then
    raise exception using errcode = '42501', message = 'This account was deleted. Sign in again with an account that exists.';
  end if;
  if not coalesce(p_write, false) then
    return 0;
  end if;
  select value into cap from public.owner_limits where name = 'connector_writes_per_minute';
  insert into public.connector_writes as w (owner_id, minute, writes)
    values (me, this_minute, 1)
    on conflict (owner_id, minute) do update set writes = w.writes + 1
    returning writes into n;
  delete from public.connector_writes where owner_id = me and minute < this_minute - interval '1 hour';
  if cap is not null and n > cap then
    raise exception using errcode = 'P0001',
      message = format('The limit is %s changes a minute per person, and this one would pass it. Wait a minute and try again.', cap),
      hint = 'owner_limits names the limit.';
  end if;
  return n;
end $$;
revoke execute on function public.connector_call(boolean) from public, anon;
grant execute on function public.connector_call(boolean) to authenticated;

-- whether the caller may delete their account with this email. It refuses with the reason, and the connector asks it
-- before it removes a single file, so a wrong email or the admin leaves the files where they are
create function public.may_delete_account(p_email text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mail text;
begin
  if me is null then
    raise exception using errcode = '42501', message = 'Sign in first, an account is deleted by its own person only.';
  end if;
  select email into mail from auth.users where id = me;
  if not found then
    raise exception using errcode = '42501', message = 'This account was deleted already.';
  end if;
  if p_email is null or mail is null or lower(btrim(p_email)) <> lower(mail) then
    raise exception using errcode = '42501',
      message = 'The email does not match this account. The person types the email their account signs in with.';
  end if;
  if exists (select 1 from public.admins where user_id = me) then
    raise exception using errcode = '42501', message = 'The admin account cannot be deleted this way.';
  end if;
  return true;
end $$;
revoke execute on function public.may_delete_account(text) from public, anon;
grant execute on function public.may_delete_account(text) to authenticated;

create function public.delete_account(p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  perform public.may_delete_account(p_email);
  if exists (select 1 from storage.objects where bucket_id = 'bookings' and (storage.foldername(name))[1] = me::text) then
    raise exception using errcode = 'P0001',
      message = 'Files are left in the bookings bucket. Remove them first, then delete the account.';
  end if;

  update public.tasks set status = 'failed', result = 'The account was deleted.', done_at = now()
    where owner_id = me and status = 'working';

  -- every table of public with an owner_id, so a table a later migration adds is counted without a change here
  for t in
    select c.relname from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r', 'p') and a.attname = 'owner_id' and not a.attisdropped
    order by c.relname
  loop
    execute format('select count(*) from public.%I where owner_id = $1', t) into n using me;
    counts := counts || jsonb_build_object(t, n);
  end loop;

  -- the invite names the person by email and carries no owner_id, so no cascade takes it
  delete from public.invites
    where email = (select lower(btrim(u.email)) from auth.users u where u.id = me);

  delete from auth.users where id = me;
  return counts;
end $$;
revoke execute on function public.delete_account(text) from public, anon;
grant execute on function public.delete_account(text) to authenticated;

-- every foreign key from public to auth.users cascades, or the delete above would stop on it
do $$
declare bad text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into bad
    from pg_catalog.pg_constraint
    where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype <> 'c'
      and connamespace = 'public'::regnamespace;
  if bad is not null then
    raise exception 'these keys to auth.users do not cascade: %', bad;
  end if;
end $$;
