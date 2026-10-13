-- After 001–003. Existing unknown owners stay quarantined; never guess an owner.
-- Requires existing core workspaces/video_projects/scenes/media tables. Inspect drift first.
begin;
alter table public.workspaces add constraint account_owner_required check (user_id is not null) not valid;
alter table public.workspaces add constraint account_owner_identity_fk foreign key(user_id) references public.users(id) not valid;
alter table public.video_projects add constraint account_workspace_required check(workspace_id is not null) not valid;
alter table public.video_projects add constraint account_workspace_fk foreign key(workspace_id) references public.workspaces(id) not valid;
create index if not exists workspaces_owner_idx on public.workspaces(user_id);
create index if not exists video_projects_workspace_idx on public.video_projects(workspace_id);
create unique index if not exists scenes_id_project_owned_idx on public.scenes(id,project_id);
create unique index if not exists media_id_project_owned_idx on public.media(id,project_id);

-- Supersede every old policy on known owned resources. Unknown objects remain
-- quarantined by 001's revoked grants and are not automatically enabled.
do $$
declare resource record; old_policy record; expression text;
begin
  for resource in select * from (values
    ('workspaces','owner'),('video_projects','workspace'),('scenes','project'),
    ('media','project'),('timeline_items','project'),('overlay_clips','project'),
    ('act_narrations','project'),('channel_facts','workspace'),('thumbnails','project'),
    ('presentation_evidence','project'),('presentation_suggestion_runs','project')
  ) as resources(name,scope)
  loop
    if to_regclass('public.'||resource.name) is null then continue; end if;
    for old_policy in select policyname from pg_policies where schemaname='public' and tablename=resource.name
    loop execute format('drop policy %I on public.%I',old_policy.policyname,resource.name); end loop;
    execute format('alter table public.%I enable row level security',resource.name);
    execute format('revoke all on public.%I from public,anon,authenticated',resource.name);
    execute format('grant select on public.%I to authenticated',resource.name);
    expression := case resource.scope
      when 'owner' then 'user_id=(select auth.uid())'
      when 'workspace' then 'exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=(select auth.uid()))'
      else 'exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=(select auth.uid()))'
    end;
    expression := '('||expression||') and coalesce((select auth.jwt()->>''is_anonymous''),''false'')<>''true''';
    execute format('create policy owned_read on public.%I for select to authenticated using (%s)',resource.name,expression);
    -- Future permissive policies cannot weaken isolation. Write grants stay closed
    -- except narrowly validated RPCs below; restriction alone grants no operation.
    execute format('create policy owned_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',resource.name,expression,expression);
    if resource.scope <> 'owner' then
      execute format('alter table public.%I add constraint %I check (%I is not null) not valid',resource.name,resource.name||'_owned_parent_required',
        case when resource.scope='workspace' then 'workspace_id' else 'project_id' end);
      execute format('alter table public.%I add constraint %I foreign key(%I) references public.%I(id) not valid',resource.name,resource.name||'_owned_parent_fk',
        case when resource.scope='workspace' then 'workspace_id' else 'project_id' end,
        case when resource.scope='workspace' then 'workspaces' else 'video_projects' end);
      execute format('create index if not exists %I on public.%I(%I)', resource.name||'_owned_parent_idx',resource.name,
        case when resource.scope='workspace' then 'workspace_id' else 'project_id' end);
    end if;
  end loop;
end $$;

-- NOT VALID preserves incompatible old rows for explicit repair, but new writes
-- cannot mix scenes/media from different projects, even under one owner.
do $$ declare link record; begin
  for link in select * from (values
    ('scenes','media_id','media'),('timeline_items','media_id','media'),
    ('overlay_clips','scene_id','scenes'),('thumbnails','source_scene_id','scenes'),
    ('thumbnails','source_media_id','media'),('thumbnails','composited_media_id','media')
  ) as links(child,col,parent)
  loop
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=link.child and column_name=link.col) then
      execute format('alter table public.%I add constraint %I foreign key (%I,project_id) references public.%I(id,project_id) not valid',
        link.child,link.child||'_'||link.col||'_same_project',link.col,link.parent);
    end if;
  end loop;
end $$;

create table public.account_workspace_operations (
  id uuid primary key,actor_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,payload jsonb not null
);
alter table public.account_workspace_operations enable row level security;
revoke all on public.account_workspace_operations from public,anon,authenticated;

create or replace function public.create_owned_workspace(payload jsonb, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); existing public.workspaces; created uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.users where id=actor) then raise exception 'PROFILE_REQUIRED'; end if;
  if jsonb_typeof(payload)<>'object' or length(btrim(payload->>'name')) not between 1 and 100
    or length(btrim(payload->>'content_theme')) not between 1 and 200 then raise exception 'INVALID_WORKSPACE'; end if;
  if exists(select 1 from jsonb_object_keys(payload) as k where k not in
    ('name','content_theme','linked_accounts','narration_voice_id','visual_aesthetic','aspect_ratio','video_language','duration_pref')) then raise exception 'INVALID_FIELDS'; end if;
  if length(payload::text)>4096 then raise exception 'INVALID_WORKSPACE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into existing from public.workspaces where id=operation_id;
  if found then
    if existing.user_id<>actor or not exists(select 1 from public.account_workspace_operations r where r.id=operation_id and r.actor_id=actor and r.payload=$1) then raise exception 'OPERATION_REUSED'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.workspaces where user_id=actor)>=3 then raise exception 'TEST_WORKSPACE_LIMIT'; end if;
  insert into public.workspaces(id,user_id,name,content_theme,linked_accounts,narration_voice_id,visual_aesthetic,aspect_ratio,video_language,duration_pref)
    values(operation_id,actor,btrim(payload->>'name'),btrim(payload->>'content_theme'),coalesce(payload->'linked_accounts','[]'::jsonb),
      nullif(payload->>'narration_voice_id',''),coalesce(payload->>'visual_aesthetic','Cinematic'),
      coalesce(payload->>'aspect_ratio','Horizontal 16:9'),coalesce(payload->>'video_language','English'),coalesce(payload->>'duration_pref','60-90s')) returning id into created;
  insert into public.account_workspace_operations(id,actor_id,workspace_id,payload) values(operation_id,actor,created,payload);
  return created;
end $$;
revoke all on function public.create_owned_workspace(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_owned_workspace(jsonb,uuid) to authenticated;

create or replace function public.rename_owned_resource(resource_type text, resource_id uuid, value text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  if length(btrim(value)) not between 1 and 200 then raise exception 'INVALID_VALUE'; end if;
  if resource_type='workspace' and length(btrim(value))<=100 then
    update public.workspaces set name=btrim(value) where id=resource_id and user_id=auth.uid();
  elsif resource_type='project' then
    update public.video_projects p set topic=btrim(value) where p.id=resource_id and exists
      (select 1 from public.workspaces w where w.id=p.workspace_id and w.user_id=auth.uid());
  else raise exception 'INVALID_RESOURCE'; end if;
  if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
end $$;
revoke all on function public.rename_owned_resource(text,uuid,text) from public,anon,authenticated;
grant execute on function public.rename_owned_resource(text,uuid,text) to authenticated;
commit;
