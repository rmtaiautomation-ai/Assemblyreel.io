-- AUTH-ONLY QUARANTINE. Review the inventory and take a private backup first.
-- Applies to this entire project, not a single workspace. No content is deleted.
-- Do not replay older permissive SQL after this migration.
begin;

revoke all on schema public from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Table REVOKE does not remove column grants. Include views and future-known tables.
do $$
declare col record; relation record;
begin
  for col in select table_name, column_name from information_schema.columns where table_schema = 'public'
  loop
    execute format('revoke all (%I) on public.%I from public, anon, authenticated', col.column_name, col.table_name);
  end loop;
  for relation in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('alter table public.%I enable row level security', relation.relname);
  end loop;
end $$;

-- Applies to objects subsequently created by the migration role. Inventory other
-- creator roles separately; later migrations must explicitly grant narrow access.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Existing public object URLs bypass table RLS. Make ALL project buckets private.
-- Restrictive policy overrides existing permissive policies without deleting them.
update storage.buckets set public = false where public;
alter table storage.objects enable row level security;
drop policy if exists auth_only_quarantine on storage.objects;
create policy auth_only_quarantine on storage.objects as restrictive for all
  to anon, authenticated using (false) with check (false);

commit;
