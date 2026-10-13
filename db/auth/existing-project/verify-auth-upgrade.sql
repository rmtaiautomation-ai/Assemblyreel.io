-- Read-only checks within the upgrade transaction; raises rather than commits drift.
do $$
declare relation record; col record;
begin
  for relation in select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    if not relation.relrowsecurity then raise exception 'RLS_REQUIRED: %',relation.relname; end if;
    if has_table_privilege('anon','public.'||quote_ident(relation.relname),'SELECT,INSERT,UPDATE,DELETE')
      or has_any_column_privilege('anon','public.'||quote_ident(relation.relname),'SELECT,INSERT,UPDATE')
      or has_table_privilege('authenticated','public.'||quote_ident(relation.relname),'INSERT,UPDATE,DELETE')
      or has_any_column_privilege('authenticated','public.'||quote_ident(relation.relname),'INSERT,UPDATE')
      then raise exception 'BROWSER_GRANT_DRIFT: %',relation.relname; end if;
    if relation.relname<>'users' and (has_table_privilege('authenticated','public.'||quote_ident(relation.relname),'SELECT')
      or has_any_column_privilege('authenticated','public.'||quote_ident(relation.relname),'SELECT'))
      then raise exception 'LEGACY_READ_GRANT_DRIFT: %',relation.relname; end if;
  end loop;
  for col in select column_name from information_schema.columns where table_schema='public' and table_name='users'
  loop
    if has_column_privilege('authenticated','public.users',col.column_name,'SELECT')<>(col.column_name in ('id','email'))
      then raise exception 'IDENTITY_COLUMN_GRANT_DRIFT'; end if;
  end loop;
  if exists(select 1 from storage.buckets where public) or not exists(
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='auth_only_quarantine' and permissive='RESTRICTIVE' and qual='false' and with_check='false')
    then raise exception 'PRIVATE_STORAGE_BOUNDARY_REQUIRED'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and tgenabled='O')
    then raise exception 'IDENTITY_TRIGGER_REQUIRED'; end if;
  if has_schema_privilege('anon','account_access_backup_20261013','USAGE')
    or has_schema_privilege('authenticated','account_access_backup_20261013','USAGE')
    or has_schema_privilege('service_role','account_access_backup_20261013','USAGE')
    then raise exception 'BACKUP_SCHEMA_EXPOSED'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='account_access_backup_20261013' and c.relkind in ('r','p') and not c.relrowsecurity)
    then raise exception 'BACKUP_RLS_REQUIRED'; end if;
end $$;
select 'PASS: existing content preserved; signup/login database prepared; email settings and local activation pending' as result;
