-- Sign up by invite (task 6.1 of FEAT-006). Phase 6 decided sign up is invite only and an outside person signs in by
-- email alone. public.invites holds the addresses that may make an account. Supabase Auth calls
-- public.hook_before_user_created as its before_user_created hook every time it is about to make a new user, by email
-- link, code, password or an outside provider. The hook lets the user be made only when the address has an unused
-- invite, and marks that invite used. A sign in of a person who already has an account makes no user, so the hook
-- never runs for it and the admin and every existing person sign in as before. A user made through the admin API with
-- the secret key does not pass the hook either.
--
-- Supabase calls the hook outside the transaction that makes the user, so a sign up that fails after the hook, such as
-- a mail that cannot be sent, leaves its invite used. tripdb invite on the same address opens it again.
--
-- Turning the hook off in the project's Auth settings opens sign up to anyone, with no migration of the rows.

create table public.invites (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  invited_at timestamptz not null default now(),
  used_at timestamptz
);
comment on table public.invites is
  'Addresses that may make an account (FEAT-006 task 6.1). Read by public.hook_before_user_created only. No client reads or writes it, the admin manages it with tripdb invite and tripdb invites on the secret key.';

-- a service table like admins and owner_limits: row level security on with no policy, and no grant to a client
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- The hook contract: Supabase Auth passes {"metadata": ..., "user": {..., "email": ...}} and takes {} to go on, or
-- {"error": {"http_code": ..., "message": ...}} to refuse, and the client gets that code and message. The answer is the
-- same for an address that was never invited and one whose invite is used, so a refusal tells nothing more.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  addr text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if addr <> '' then
    update public.invites set used_at = now() where email = addr and used_at is null;
    if found then
      return '{}'::jsonb;
    end if;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Sign up is by invite only'));
end
$$;
comment on function public.hook_before_user_created(jsonb) is
  'The before_user_created hook of Supabase Auth: a new user only for an address with an unused invite, which it marks used.';

-- only Supabase Auth calls it, as Supabase documents for a Postgres hook
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- No password from a sign up. Sign up is on for the hook above, and that opens email and password sign up at
-- /auth/v1/signup to anyone with the public publishable key. Someone who knows an invited address could sign up first
-- with a password of their own. Confirm email stays on in the project, so that sign up gets no session, but once the
-- invitee confirms the address with their first email link the stranger's password would sign in to their account. The
-- planner signs in by email link only, so this trigger clears the password of every user a client sign up makes, and
-- stores the empty string Supabase Auth keeps for a user with no password. A sign in by password then fails for that
-- user, before and after the address is confirmed.
--
-- The row Supabase Auth inserts is the same for a client sign up and for the admin API: both insert the address not yet
-- confirmed, and the admin API confirms it in a second step. What tells them apart is the hook, which runs before every
-- client sign up and never for the admin API, and has just marked the address's invite used. So the trigger clears the
-- password when the address has a used invite. A user made through the admin API, as the database tests and scripts
-- make them, has no used invite and keeps its password. It reads public.invites, which no client may, so it runs as
-- its owner like the hook, and no client may call it.
create function public.clear_signup_password() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.invites where email = lower(btrim(new.email)) and used_at is not null) then
    new.encrypted_password := '';
  end if;
  return new;
end
$$;
comment on function public.clear_signup_password() is
  'Before insert on auth.users: a user made by a client sign up, which used an invite, gets no password, so a password given at sign up never signs in (FEAT-006 task 6.1).';
revoke execute on function public.clear_signup_password() from public, anon, authenticated;

create trigger clear_signup_password
  before insert on auth.users
  for each row execute function public.clear_signup_password();
