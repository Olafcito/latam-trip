-- Open sign up (task 6.1 of FEAT-006, changed on 2026-11-07, PROD-009). Sign up is no longer invite only. Anyone who
-- types their email in the planner gets the sign in link, and the account is made on first use. The connector's
-- consent signs in through the planner, so it is open the same way.
--
-- The before_user_created hook of 0036 stays registered in the project's Auth settings, so this migration changes only
-- what it answers. It lets every new user be made, and records the address in public.invites with used_at now. The
-- table keeps its name, and its meaning becomes the addresses that made their account through a client sign up. Supabase
-- Auth calls the hook before every user a client sign up makes, by email link, code, password or an outside provider,
-- and never for a user made through the admin API with the secret key.
--
-- The trigger clear_signup_password of 0036 is what the record is for. Sign up is open at /auth/v1/signup to anyone
-- with the public publishable key, and a password given there could later sign in once the address is confirmed by its
-- email link. The trigger runs before the insert into auth.users, after the hook, finds the address the hook has just
-- recorded and clears the password, so a password from a client sign up never signs in. A user made through the admin
-- API, as the database tests and scripts make them, passes no hook, has no row and keeps its password. The trigger
-- itself is unchanged, only its comment moves with the new meaning.
--
-- The hook runs outside the transaction that makes the user, so a sign up that fails after it, such as a link that
-- cannot be sent, still leaves its row. delete_account of 0037 deletes the row of the person's own email. A user the
-- admin deletes with the admin API leaves its row, and a user the admin API makes again for that address later gets no
-- password. Nothing in the project does that, and deleting the row first gives the password back.

-- Upsert, so a second client sign up for the same address, such as after its account was deleted, records it again.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  addr text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if addr ~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    insert into public.invites (email, invited_at, used_at) values (addr, now(), now())
      on conflict (email) do update set used_at = now();
  end if;
  return '{}'::jsonb;
end
$$;
comment on function public.hook_before_user_created(jsonb) is
  'The before_user_created hook of Supabase Auth: lets every new user be made and records the address in public.invites as a client sign up, so clear_signup_password strips its password (FEAT-006 task 6.1, PROD-009).';

-- create or replace keeps the grants of 0036: only supabase_auth_admin runs it

comment on table public.invites is
  'Addresses that made their account through a client sign up (FEAT-006 task 6.1, PROD-009). Written by public.hook_before_user_created, read by the trigger clear_signup_password, and a row is deleted by delete_account. No client reads or writes it. The name is from the invite only sign up of 0036.';
comment on column public.invites.invited_at is 'When the address first made an account through a client sign up.';
comment on column public.invites.used_at is 'When the address last made an account through a client sign up.';

comment on function public.clear_signup_password() is
  'Before insert on auth.users: a user made by a client sign up, which the hook has just recorded in public.invites, gets no password, so a password given at /auth/v1/signup never signs in. A user made through the admin API keeps its password (FEAT-006 task 6.1).';
