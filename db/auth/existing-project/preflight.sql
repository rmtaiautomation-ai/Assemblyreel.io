-- READ ONLY: run in the existing Assemblyreels project's SQL Editor.
-- Export the result to scratch/account-access-preflight.csv for local review.
-- Schema metadata and aggregate counts only; no passwords, tokens or customer rows.
-- Legacy foreign keys may be text. Compare normalized text without casting
-- potentially malformed stored values to UUID; this query changes no types.
select jsonb_build_object(
  'columns', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select table_name,column_name,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public'
    order by table_name,ordinal_position
  ) x),'[]'::jsonb),
  'relations', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select n.nspname as schema,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m')
    order by n.nspname,c.relname
  ) x),'[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select conrelid::regclass::text as relation,conname,convalidated,pg_get_constraintdef(oid) as definition
    from pg_constraint where connamespace='public'::regnamespace order by conrelid,conname
  ) x),'[]'::jsonb),
  'policies', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname
  ) x),'[]'::jsonb),
  'functions', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig,p.proacl::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by p.proname,p.oid
  ) x),'[]'::jsonb),
  'auth_triggers', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select tgname,tgenabled,pg_get_triggerdef(oid) as definition from pg_trigger
    where tgrelid='auth.users'::regclass and not tgisinternal order by tgname
  ) x),'[]'::jsonb),
  'buckets', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id
  ) x),'[]'::jsonb),
  'column_grants', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select table_schema,table_name,column_name,grantee,privilege_type
    from information_schema.column_privileges
    where table_schema in ('public','storage') order by table_schema,table_name,column_name,grantee,privilege_type
  ) x),'[]'::jsonb),
  'default_grants', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select pg_get_userbyid(d.defaclrole) as creator,n.nspname as schema,d.defaclobjtype,d.defaclacl::text
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or n.nspname in ('public','storage') order by d.defaclrole,d.defaclnamespace,d.defaclobjtype
  ) x),'[]'::jsonb),
  'counts', jsonb_build_object(
    'auth_users',(select count(*) from auth.users),
    'profiles',(select count(*) from public.users),
    'workspaces',(select count(*) from public.workspaces),
    'ownerless_workspaces',(select count(*) from public.workspaces where user_id is null),
    'workspaces_missing_profile',(select count(*) from public.workspaces w left join public.users u on lower(btrim(u.id::text))=lower(btrim(w.user_id::text)) where w.user_id is not null and u.id is null),
    'projects',(select count(*) from public.video_projects),
    'orphan_projects',(select count(*) from public.video_projects p left join public.workspaces w on lower(btrim(w.id::text))=lower(btrim(p.workspace_id::text)) where w.id is null),
    'scenes',(select count(*) from public.scenes),
    'orphan_scenes',(select count(*) from public.scenes s left join public.video_projects p on lower(btrim(p.id::text))=lower(btrim(s.project_id::text)) where p.id is null),
    'non_uuid_scene_project_references',(select count(*) from public.scenes where project_id is not null and btrim(project_id::text)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'media',(select count(*) from public.media),
    'orphan_media',(select count(*) from public.media m left join public.video_projects p on lower(btrim(p.id::text))=lower(btrim(m.project_id::text)) where p.id is null),
    'non_uuid_media_project_references',(select count(*) from public.media where project_id is not null and btrim(project_id::text)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'public_buckets',(select count(*) from storage.buckets where public)
  )
) as account_access_preflight;
