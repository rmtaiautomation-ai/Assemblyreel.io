-- Read-only. Run after inventory and before enabling owned content. Keep rows/IDs private.
select 'ownerless_workspaces' as issue,count(*) from public.workspaces where user_id is null
union all select 'missing_profile',count(*) from public.workspaces w left join public.users u on u.id=w.user_id where w.user_id is not null and u.id is null
union all select 'orphan_projects',count(*) from public.video_projects p left join public.workspaces w on w.id=p.workspace_id where w.id is null
union all select 'orphan_scenes',count(*) from public.scenes s left join public.video_projects p on p.id=s.project_id where p.id is null
union all select 'orphan_media',count(*) from public.media m left join public.video_projects p on p.id=m.project_id where p.id is null;
-- Inspect every composite constraint awaiting legacy repairs; NOT VALID constraints
-- already protect new writes. Validate only after the explicit owner/relationship repair.
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) from pg_constraint
  where connamespace='public'::regnamespace and not convalidated;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
  where schemaname in ('public','storage');
