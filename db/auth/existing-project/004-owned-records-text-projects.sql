-- DRAFT: existing Assemblyreels schema only. Do not apply before fresh catalog review.
-- Replaces generic 004 for this project; does not apply 005–007 or assign legacy owners.
-- Final release must be bundled with reviewed catalog/data/backup drift guards.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$declare item record; begin
  if to_regnamespace('account_access_backup_20261013') is null or
     to_regclass('public.marketing_leads') is null then raise exception 'AUTH_CONTAINMENT_REQUIRED'; end if;
  if to_regclass('public.account_request_limits') is null then raise exception 'REQUEST_LIMITS_REQUIRED'; end if;
  if to_regclass('public.account_workspace_operations') is not null or
     to_regclass('public.account_project_operations') is not null or
     exists(select 1 from information_schema.columns where table_schema='public' and table_name='scenes' and column_name='account_project_id') then
    raise exception 'OWNERSHIP_ALREADY_STARTED';
  end if;
  for item in select * from (values
    ('users','id','uuid'),('workspaces','id','uuid'),('workspaces','user_id','uuid'),
    ('video_projects','id','uuid'),('video_projects','workspace_id','uuid'),
    ('scenes','id','uuid'),('scenes','project_id','text'),('scenes','media_id','uuid'),
    ('media','id','uuid'),('media','project_id','uuid'),
    ('timeline_items','project_id','uuid'),('timeline_items','media_id','uuid'),
    ('overlay_clips','project_id','uuid'),('act_narrations','project_id','uuid'),('channel_facts','workspace_id','uuid')
  ) as expected(relation,col,kind) loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=item.relation
      and column_name=item.col and udt_name=item.kind) then raise exception 'OWNERSHIP_SCHEMA_DRIFT'; end if;
  end loop;
  if (select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and
    (column_name='id' and udt_name='uuid' or column_name='email_confirmed_at' and udt_name='timestamptz'
     or column_name='banned_until' and udt_name='timestamptz' or column_name='is_anonymous' and udt_name='bool'))<>4 then
    raise exception 'AUTH_SCHEMA_DRIFT';
  end if;
  if exists(select 1 from storage.buckets where public) or not exists(select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='auth_only_quarantine' and permissive='RESTRICTIVE'
      and qual='false' and with_check='false') then raise exception 'PRIVATE_STORAGE_REQUIRED'; end if;
end $$;

-- Preserve the existing text field and every original row. Malformed old references
-- project to NULL; NOT VALID preserves old orphans while enforcing all new writes.
alter table public.scenes add column account_project_id uuid generated always as (
  case when project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then project_id::uuid else null end
) stored;
alter table public.scenes add constraint scenes_account_project_required
  check(account_project_id is not null and project_id=account_project_id::text) not valid;
alter table public.scenes add constraint scenes_account_project_fk
  foreign key(account_project_id) references public.video_projects(id) not valid;
alter table public.workspaces add constraint account_owner_required check(user_id is not null) not valid;
alter table public.workspaces add constraint account_owner_identity_fk foreign key(user_id) references public.users(id) not valid;

create index workspaces_owner_idx on public.workspaces(user_id);
create index scenes_account_project_idx on public.scenes(account_project_id);
create unique index media_id_project_owned_idx on public.media(id,project_id);
create unique index scenes_id_project_owned_idx on public.scenes(id,account_project_id);
alter table public.scenes add constraint scenes_media_same_project
  foreign key(media_id,account_project_id) references public.media(id,project_id) not valid;
alter table public.timeline_items add constraint timeline_items_media_same_project
  foreign key(media_id,project_id) references public.media(id,project_id) not valid;

-- Use the stored verified account state as well as JWT identity. This helper returns
-- no email, credits or Auth row and uses an empty search_path under its trusted owner.
create function public.account_owned_actor() returns uuid
language sql stable security definer set search_path='' as $$
  select a.id from auth.users a join public.users u on u.id=a.id
  where a.id=auth.uid() and a.email_confirmed_at is not null and coalesce(a.is_anonymous,false)=false
    and (a.banned_until is null or a.banned_until<=now())
    and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
$$;
revoke all on function public.account_owned_actor() from public,anon,authenticated;
grant execute on function public.account_owned_actor() to authenticated;

do $$declare resource record; col record; old_policy record; expression text; parent text; begin
  for resource in select * from (values
    ('workspaces','owner'),('video_projects','workspace'),('scenes','scene'),('media','project'),
    ('timeline_items','project'),('overlay_clips','project'),('act_narrations','project'),('channel_facts','workspace')
  ) as resources(name,scope) loop
    for old_policy in select policyname from pg_policies where schemaname='public' and tablename=resource.name loop
      execute format('drop policy %I on public.%I',old_policy.policyname,resource.name);
    end loop;
    execute format('alter table public.%I enable row level security',resource.name);
    execute format('revoke all on public.%I from public,anon,authenticated',resource.name);
    -- Table REVOKE alone does not remove separately granted column privileges.
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=resource.name loop
      execute format('revoke all (%I) on public.%I from public,anon,authenticated',col.column_name,resource.name);
    end loop;
    expression := case resource.scope
      when 'owner' then 'user_id=(select public.account_owned_actor())'
      when 'workspace' then format('exists(select 1 from public.workspaces w where w.id=%I.workspace_id and w.user_id=(select public.account_owned_actor()))',resource.name)
      else format('exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=%I.%I and w.user_id=(select public.account_owned_actor()))',
        resource.name,case when resource.scope='scene' then 'account_project_id' else 'project_id' end)
    end;
    execute format('grant select on public.%I to authenticated',resource.name);
    execute format('create policy owned_read on public.%I for select to authenticated using (%s)',resource.name,expression);
    execute format('create policy owned_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',resource.name,expression,expression);
    if resource.scope not in ('owner','scene') then
      parent := case when resource.scope='workspace' then 'workspace_id' else 'project_id' end;
      execute format('alter table public.%I add constraint %I check(%I is not null) not valid',resource.name,resource.name||'_owned_parent_required',parent);
      execute format('alter table public.%I add constraint %I foreign key(%I) references public.%I(id) not valid',resource.name,resource.name||'_owned_parent_fk',parent,
        case when resource.scope='workspace' then 'workspaces' else 'video_projects' end);
      execute format('create index %I on public.%I(%I)',resource.name||'_owned_parent_idx',resource.name,parent);
    end if;
  end loop;
end $$;

create table public.account_workspace_operations (
  id uuid primary key,actor_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,payload jsonb not null
);
create table public.account_project_operations (
  id uuid primary key,actor_id uuid not null references auth.users(id),
  project_id uuid not null references public.video_projects(id) on delete cascade,payload jsonb not null
);
alter table public.account_workspace_operations enable row level security;
alter table public.account_project_operations enable row level security;
revoke all on public.account_workspace_operations,public.account_project_operations from public,anon,authenticated;

create function public.create_owned_workspace(payload jsonb,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.account_owned_actor(); existing public.workspaces; key text; item jsonb; begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if operation_id is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>4096 then raise exception 'INVALID_WORKSPACE'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in
    ('name','content_theme','linked_accounts','narration_voice_id','visual_aesthetic','aspect_ratio','video_language','duration_pref')) then raise exception 'INVALID_FIELDS'; end if;
  foreach key in array array['name','content_theme'] loop
    if jsonb_typeof(payload->key) is distinct from 'string' or length(btrim(payload->>key)) not between 1 and
      (case when key='name' then 100 else 200 end) then raise exception 'INVALID_WORKSPACE'; end if;
  end loop;
  if payload ? 'linked_accounts' then
    if jsonb_typeof(payload->'linked_accounts') is distinct from 'array' then raise exception 'INVALID_WORKSPACE'; end if;
    if jsonb_array_length(payload->'linked_accounts')>1 then raise exception 'INVALID_WORKSPACE'; end if;
    for item in select value from jsonb_array_elements(payload->'linked_accounts') loop
      if jsonb_typeof(item)<>'string' or length(item#>>'{}')>200 then raise exception 'INVALID_WORKSPACE'; end if;
    end loop;
  end if;
  if payload ? 'narration_voice_id' and (jsonb_typeof(payload->'narration_voice_id') not in ('string','null') or length(payload->>'narration_voice_id')>100) then raise exception 'INVALID_WORKSPACE'; end if;
  foreach key in array array['visual_aesthetic','aspect_ratio','video_language','duration_pref'] loop
    if payload ? key and jsonb_typeof(payload->key) is distinct from 'string' then raise exception 'INVALID_WORKSPACE'; end if;
  end loop;
  if payload ? 'visual_aesthetic' and payload->>'visual_aesthetic' not in ('Charcoal','Cinematic','Minimalist','Cyberpunk','Watercolor','Anime','Photorealistic','Oil Painting','Claymation','Vector Art')
    or payload ? 'aspect_ratio' and payload->>'aspect_ratio' not in ('Vertical 9:16','Horizontal 16:9','Square 1:1')
    or payload ? 'video_language' and payload->>'video_language' not in ('English','Spanish','French','German','Japanese')
    or payload ? 'duration_pref' and payload->>'duration_pref' not in ('30-60s','60-90s','2-3m','3-5m','5-10m','10-20m','20-30 minutes') then raise exception 'INVALID_WORKSPACE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into existing from public.workspaces where id=operation_id;
  if found then
    if existing.user_id is distinct from actor or not exists(select 1 from public.account_workspace_operations r
      where r.id=operation_id and r.actor_id=actor and r.workspace_id=existing.id and r.payload=$1) then raise exception 'OPERATION_REUSED'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.workspaces where user_id=actor)>=3 then raise exception 'TEST_WORKSPACE_LIMIT'; end if;
  perform public.admit_account_request('workspace');
  insert into public.workspaces(id,user_id,name,content_theme,linked_accounts,narration_voice_id,visual_aesthetic,aspect_ratio,video_language,duration_pref)
    values(operation_id,actor,btrim(payload->>'name'),btrim(payload->>'content_theme'),coalesce(payload->'linked_accounts','[]'::jsonb),
      nullif(payload->>'narration_voice_id',''),coalesce(payload->>'visual_aesthetic','Cinematic'),
      coalesce(payload->>'aspect_ratio','Horizontal 16:9'),coalesce(payload->>'video_language','English'),coalesce(payload->>'duration_pref','60-90s'));
  insert into public.account_workspace_operations values(operation_id,actor,operation_id,payload);
  return operation_id;
end $$;

create function public.create_owned_project(payload jsonb,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.account_owned_actor(); workspace uuid; existing public.video_projects; begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if operation_id is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>1024 then raise exception 'INVALID_PROJECT'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('workspace_id','topic')) then raise exception 'INVALID_FIELDS'; end if;
  if jsonb_typeof(payload->'topic') is distinct from 'string' or length(btrim(payload->>'topic')) not between 1 and 200
    or jsonb_typeof(payload->'workspace_id') is distinct from 'string'
    or coalesce(payload->>'workspace_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_PROJECT'; end if;
  workspace:=(payload->>'workspace_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  if not exists(select 1 from public.workspaces where id=workspace and user_id=actor) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  select * into existing from public.video_projects where id=operation_id;
  if found then
    if existing.workspace_id<>workspace or not exists(select 1 from public.account_project_operations r
      where r.id=operation_id and r.actor_id=actor and r.project_id=existing.id and r.payload=$1) then raise exception 'OPERATION_REUSED'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.video_projects where workspace_id=workspace)>=10 then raise exception 'TEST_PROJECT_LIMIT'; end if;
  perform public.admit_account_request('workspace');
  insert into public.video_projects(id,workspace_id,topic,status) values(operation_id,workspace,btrim(payload->>'topic'),'Drafting');
  insert into public.account_project_operations values(operation_id,actor,operation_id,payload);
  return operation_id;
end $$;

create function public.rename_owned_resource(resource_type text,resource_id uuid,value text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.account_owned_actor(); begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if resource_id is null or value is null or length(btrim(value)) not between 1 and 200 then raise exception 'INVALID_VALUE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  perform public.admit_account_request('rename');
  if resource_type='workspace' and length(btrim(value))<=100 then
    update public.workspaces set name=btrim(value) where id=resource_id and user_id=actor;
  elsif resource_type='project' then
    update public.video_projects p set topic=btrim(value) where p.id=resource_id and exists
      (select 1 from public.workspaces w where w.id=p.workspace_id and w.user_id=actor);
  else raise exception 'INVALID_RESOURCE'; end if;
  if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
end $$;
revoke all on function public.create_owned_workspace(jsonb,uuid),public.create_owned_project(jsonb,uuid),public.rename_owned_resource(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.create_owned_workspace(jsonb,uuid),public.create_owned_project(jsonb,uuid),public.rename_owned_resource(text,uuid,text) to authenticated;

-- Storage, marketing leads, account profiles and all unlisted resources retain the
-- prior containment. Application feature flags remain off until live acceptance.
commit;
