-- Read-only preflight. Save output privately; never commit rows or object URLs.
select n.nspname as schema, c.relname as relation, c.relkind, c.relrowsecurity,
  c.relforcerowsecurity, c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m');
select * from pg_policies where schemaname in ('public','storage');
select routine_schema,routine_name,grantee,privilege_type from information_schema.routine_privileges
  where routine_schema in ('public','storage');
select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges
  where table_schema in ('public','storage');
select n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','storage');
select pg_get_triggerdef(oid) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets;
select count(*) as workspaces, count(*) filter (where user_id is null) as unresolved_owners from public.workspaces;
