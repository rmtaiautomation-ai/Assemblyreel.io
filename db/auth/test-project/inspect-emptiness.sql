-- READ ONLY: identifies why the fresh-test bootstrap refused this project.
-- Does not change permissions, delete data, or display account details.
select 'auth_users' as check_name, count(*) as existing_count from auth.users
union all
select 'storage_buckets', count(*) from storage.buckets
union all
select 'public_tables', count(*) from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
union all
select 'auth_user_triggers', count(*) from pg_trigger
  where tgrelid='auth.users'::regclass and not tgisinternal;

-- Object names only; no customer rows, email addresses or object URLs.
select 'public_table' as object_type, c.relname::text as object_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
union all
select 'auth_user_trigger', tgname::text from pg_trigger
  where tgrelid='auth.users'::regclass and not tgisinternal
order by object_type,object_name;
