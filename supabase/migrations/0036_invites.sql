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
