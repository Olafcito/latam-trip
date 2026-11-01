-- An empty rows array checks the token and writes nothing, so the userscript can test its settings.
create or replace function public.submit_inbox(token text, file text, rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if token is null or not exists (
    select 1 from public.inbox_tokens t
    where t.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')
  ) then
    raise exception 'invalid inbox token' using errcode = '28000';
  end if;
  if rows is null or pg_catalog.jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  insert into public.inbox (file, status, rows) values (pg_catalog.left(file, 200), 'new', rows);
  return pg_catalog.jsonb_array_length(rows);
end;
$$;
revoke all on function public.submit_inbox(text, text, jsonb) from public;
grant execute on function public.submit_inbox(text, text, jsonb) to anon, authenticated, service_role;
