-- READ ONLY. Run as postgres in the existing Assemblyreels SQL Editor.
-- Export the single result as CSV to scratch/ownership-catalog.csv.
-- Metadata only; keep this export private. This does not apply a migration.
begin transaction isolation level repeatable read read only;
select jsonb_build_object(
  'captured_at', now(),
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'columns', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default,is_generated,generation_expression
    from information_schema.columns where table_schema='public' or (table_schema='auth' and table_name='users')
    order by table_schema,table_name,ordinal_position
  ) x),'[]'::jsonb),
  'relations', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select n.nspname as schema,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) as owner,c.relacl::text,c.reloptions
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m','S')
    order by n.nspname,c.relname
  ) x),'[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select conrelid::regclass::text as relation,conname,convalidated,
      pg_get_constraintdef(oid) as definition
    from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname
  ) x),'[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select schemaname,tablename,indexname,indexdef from pg_indexes
    where schemaname in ('public','storage') order by schemaname,tablename,indexname
  ) x),'[]'::jsonb),
  'policies', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname
  ) x),'[]'::jsonb),
  'functions', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef,p.proconfig,p.proacl::text,pg_get_userbyid(p.proowner) as owner,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p') order by p.proname,p.oid
  ) x),'[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select n.nspname as schema,c.relname as relation,t.tgname,t.tgenabled,
      pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))
    order by n.nspname,c.relname,t.tgname
  ) x),'[]'::jsonb),
  'column_grants', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select table_schema,table_name,column_name,grantee,privilege_type
    from information_schema.column_privileges where table_schema in ('public','storage')
    order by table_schema,table_name,column_name,grantee,privilege_type
  ) x),'[]'::jsonb),
  'default_grants', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select pg_get_userbyid(d.defaclrole) as creator,n.nspname as schema,d.defaclobjtype,d.defaclacl::text
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or n.nspname in ('public','storage')
    order by d.defaclrole,d.defaclnamespace,d.defaclobjtype
  ) x),'[]'::jsonb),
  'buckets', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id
  ) x),'[]'::jsonb),
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.users)
) as ownership_catalog;
commit;
