-- Apply after 001–006 on the explicitly selected staging project. No provider work.
begin;
create table public.account_onboarding (
  actor_id uuid primary key references public.users(id),
  revision integer not null check (revision between 1 and 1000000),
  settings jsonb not null,
  workspace_id uuid references public.workspaces(id),
  project_id uuid references public.video_projects(id),
  check ((workspace_id is null) = (project_id is null))
);
alter table public.account_onboarding enable row level security;
revoke all on public.account_onboarding from public, anon, authenticated;
grant select on public.account_onboarding to authenticated;
create policy onboarding_read on public.account_onboarding for select to authenticated using
  (actor_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');
create policy onboarding_boundary on public.account_onboarding as restrictive for all to authenticated using
  (actor_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'true');

create function public.save_account_onboarding(expected_revision integer, settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.account_onboarding; chosen uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.users where id=actor) then raise exception 'PROFILE_REQUIRED'; end if;
  if expected_revision is null or expected_revision not between 0 and 999999 or settings is null
    or jsonb_typeof(settings)<>'object' or length(settings::text)>4096 then raise exception 'INVALID_SETUP'; end if;
  if (select count(*) from jsonb_object_keys(settings))<>8 or exists
    (select 1 from jsonb_object_keys(settings) k where k not in
      ('workspaceId','name','content_theme','visual_aesthetic','aspect_ratio','video_language','duration_pref','topic')) then
    raise exception 'INVALID_SETUP';
  end if;
  if exists(select 1 from jsonb_each(settings) e where e.key<>'workspaceId' and jsonb_typeof(e.value)<>'string')
    or jsonb_typeof(settings->'workspaceId') not in ('string','null')
    or length(btrim(settings->>'name')) not between 1 and 100
    or length(btrim(settings->>'content_theme')) not between 1 and 200
    or length(settings->>'topic')>200
    or settings->>'visual_aesthetic' not in ('Charcoal','Cinematic','Minimalist','Cyberpunk','Watercolor','Anime','Photorealistic','Oil Painting','Claymation','Vector Art')
    or settings->>'aspect_ratio' not in ('Vertical 9:16','Horizontal 16:9','Square 1:1')
    or settings->>'video_language' not in ('English','Spanish','French','German','Japanese')
    or settings->>'duration_pref' not in ('30-60s','60-90s','2-3m','3-5m','5-10m','10-20m','20-30 minutes') then raise exception 'INVALID_SETUP'; end if;
  chosen:=(settings->>'workspaceId')::uuid;
  if chosen is not null and not exists(select 1 from public.workspaces where id=chosen and user_id=actor) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into saved from public.account_onboarding where actor_id=actor;
  if found and saved.project_id is not null then raise exception 'SETUP_COMPLETE'; end if;
  -- Repeating the exact previous save is safe after a lost response. Changed stale data is rejected.
  if found and saved.revision=expected_revision+1 and saved.settings=settings then return to_jsonb(saved)-'actor_id'; end if;
  if coalesce(saved.revision,0)<>expected_revision then raise exception 'STALE_SETUP'; end if;
  perform public.admit_account_request('rename');
  insert into public.account_onboarding(actor_id,revision,settings) values(actor,expected_revision+1,settings)
    on conflict(actor_id) do update set revision=excluded.revision,settings=excluded.settings returning * into saved;
  return to_jsonb(saved)-'actor_id';
end $$;

create function public.complete_account_onboarding(expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.account_onboarding; workspace uuid; project uuid; payload jsonb;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.users where id=actor) then raise exception 'PROFILE_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select * into saved from public.account_onboarding where actor_id=actor;
  if not found then raise exception 'SETUP_REQUIRED'; end if;
  if saved.project_id is not null then
    if not exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id
      where p.id=saved.project_id and w.id=saved.workspace_id and w.user_id=actor) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
    return to_jsonb(saved)-'actor_id';
  end if;
  if expected_revision is null or saved.revision<>expected_revision then raise exception 'STALE_SETUP'; end if;
  if length(btrim(saved.settings->>'topic')) not between 1 and 200 then raise exception 'TOPIC_REQUIRED'; end if;
  perform public.admit_account_request('workspace');
  workspace:=(saved.settings->>'workspaceId')::uuid;
  if workspace is null then
    payload:=saved.settings-'workspaceId'-'topic';
    workspace:=public.create_owned_workspace(payload,pg_catalog.gen_random_uuid());
  elsif not exists(select 1 from public.workspaces where id=workspace and user_id=actor) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  project:=pg_catalog.gen_random_uuid();
  insert into public.video_projects(id,workspace_id,topic,status)
    values(project,workspace,btrim(saved.settings->>'topic'),'drafting');
  update public.account_onboarding set workspace_id=workspace,project_id=project where actor_id=actor returning * into saved;
  return to_jsonb(saved)-'actor_id';
end $$;
revoke all on function public.save_account_onboarding(integer,jsonb),public.complete_account_onboarding(integer) from public,anon,authenticated;
grant execute on function public.save_account_onboarding(integer,jsonb),public.complete_account_onboarding(integer) to authenticated;
commit;
