-- Row level security on every table. Only the one owner account gets in. The secret key bypasses it.

create function public.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.owners where user_id = (select auth.uid())) $$;

do $$
declare t text;
begin
  foreach t in array array['airports','places','connections','profiles','place_images','experiences','experience_images',
    'stays','quotes','trips','documents','inbox','tasks','task_log','agent_usage','leases','derive_state','derived_options',
    'owners','schema_migrations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;

-- no policy at all: no client can read a token hash
alter table public.inbox_tokens enable row level security;

-- the signed out key touches nothing, and the web roles never touch a sequence
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
