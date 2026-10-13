-- After 004; project-media and renders stay PRIVATE. No browser storage grants.
begin;
create table public.private_assets (
  id uuid primary key, project_id uuid not null references public.video_projects(id) on delete cascade,
  media_id uuid unique references public.media(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  bucket text not null check(bucket in ('project-media','renders')),
  object_key text not null unique, mime_type text not null,
  byte_size integer not null check(byte_size between 1 and 3145728),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  unique(id,project_id),
  foreign key(media_id,project_id) references public.media(id,project_id),
  check(object_key=actor_id::text||'/'||project_id::text||'/'||id::text)
);
create index private_assets_project_idx on public.private_assets(project_id);
create index private_assets_actor_idx on public.private_assets(actor_id);
alter table public.private_assets enable row level security;
revoke all on public.private_assets from public,anon,authenticated;
grant select on public.private_assets to authenticated;
create policy private_asset_read on public.private_assets for select to authenticated using(
  exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=auth.uid())
  and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
);

create table public.render_artifacts (
  id uuid primary key,project_id uuid not null references public.video_projects(id) on delete cascade,
  asset_id uuid not null,
  state text not null check(state in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  foreign key(asset_id,project_id) references public.private_assets(id,project_id)
);
alter table public.render_artifacts enable row level security;
revoke all on public.render_artifacts from public,anon,authenticated;
grant select on public.render_artifacts to authenticated;
create policy artifact_read on public.render_artifacts for select to authenticated using(
  exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=auth.uid())
  and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
);

create or replace function public.reserve_private_media(
  p_id uuid,p_project uuid,p_mime text,p_size integer,p_hash text,p_name text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.private_assets; kind text;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_project and w.user_id=actor) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if p_id is null or p_size not between 1 and 3145728 or p_size is null or p_hash is null or p_hash!~'^[a-f0-9]{64}$'
    or p_name is null or length(p_name)>100 or p_mime not in ('image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','video/mp4') or p_mime is null then raise exception 'INVALID_UPLOAD'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into existing from public.private_assets where id=p_id;
  if found then
    if existing.actor_id<>actor or existing.project_id<>p_project or existing.mime_type<>p_mime or existing.byte_size<>p_size or existing.content_hash<>p_hash then raise exception 'OPERATION_REUSED'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.private_assets where actor_id=actor)>=100
    or (select count(*) from public.private_assets where actor_id=actor and state='pending')>=10 then raise exception 'TEST_ASSET_LIMIT'; end if;
  kind:=split_part(p_mime,'/',1);
  insert into public.media(id,project_id,media_type,source,status,original_filename,storage_path,url)
    values(p_id,p_project,kind,'upload','uploading',p_name,actor::text||'/'||p_project::text||'/'||p_id::text,'/api/media/'||p_id::text||'/content');
  insert into public.private_assets(id,project_id,media_id,actor_id,bucket,object_key,mime_type,byte_size,content_hash)
    values(p_id,p_project,p_id,actor,'project-media',actor::text||'/'||p_project::text||'/'||p_id::text,p_mime,p_size,p_hash);
  return p_id;
end $$;
revoke all on function public.reserve_private_media(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_private_media(uuid,uuid,text,integer,text,text) to authenticated;

-- Only the server finalizes persistence after checked storage upload/download.
create or replace function public.finish_private_media(p_id uuid,p_actor uuid,p_hash text,p_ready boolean)
returns void language plpgsql security definer set search_path='' as $$
declare asset public.private_assets;
begin
  select * into asset from public.private_assets where id=p_id for update;
  if not found or asset.actor_id<>p_actor or asset.content_hash<>p_hash or not exists(
    select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=asset.project_id and w.user_id=p_actor
  ) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if asset.state='ready' then return; end if;
  update public.private_assets set state=case when p_ready then 'ready' else 'failed' end where id=p_id;
  update public.media set status=case when p_ready then 'ready' else 'failed' end where id=asset.media_id;
end $$;
revoke all on function public.finish_private_media(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_private_media(uuid,uuid,text,boolean) to service_role;

-- The server uses privileged storage only after verified ownership; direct browser
-- storage remains denied by 001's restrictive policy. No public URL fallback.
grant select,insert,update on public.private_assets,public.render_artifacts,public.media to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('project-media','project-media',false,3145728,array['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','video/mp4'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Existing render objects may be much larger; hosted rendering is Phase 8 and
-- remains disabled. Do not reduce the existing renders bucket limit here.
update storage.buckets set public=false where id='renders';
commit;
