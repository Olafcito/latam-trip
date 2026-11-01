-- The two functions the Momondo userscript calls with the publishable key (spec 8.2). Each checks INBOX_TOKEN against the hash
-- in inbox_tokens, which no client can read. A wrong token raises and writes nothing. They do no row checks, as ingest-inbox keeps those.

create or replace function public.submit_inbox(token text, file text, rows jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
begin
  if token is null or not exists (
       select 1 from public.inbox_tokens t
       where t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')) then
    raise exception 'invalid inbox token' using errcode = '28000';
  end if;
  if rows is null or pg_catalog.jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  insert into public.inbox (file, status, rows) values (pg_catalog.left(file, 200), 'new', rows);
  return pg_catalog.jsonb_array_length(rows);
end $$;

create or replace function public.submit_task(token text, task jsonb) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare tid bigint; kind text;
begin
  if token is null or not exists (
       select 1 from public.inbox_tokens t
       where t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')) then
    raise exception 'invalid inbox token' using errcode = '28000';
  end if;
  if task is null or pg_catalog.jsonb_typeof(task) <> 'object' then
    raise exception 'task must be a json object' using errcode = '22023';
  end if;
  kind := task ->> 'type';
  if kind is null or kind not in ('fix_parser', 'import_quotes') then
    raise exception 'a userscript task is fix_parser or import_quotes, not %', kind using errcode = '22023';
  end if;
  insert into public.tasks (type, title, data)
    values (kind, pg_catalog.left(coalesce(task ->> 'title', '[' || kind || ']'), 300), task)
    returning id into tid;
  return tid;
end $$;

revoke execute on function public.submit_inbox(text, text, jsonb) from public;
revoke execute on function public.submit_task(text, jsonb) from public;
grant execute on function public.submit_inbox(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.submit_task(text, jsonb) to anon, authenticated, service_role;
