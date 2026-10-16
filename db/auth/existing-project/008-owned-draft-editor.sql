-- Existing text-project AssemblyReel schema, AFTER the guarded ownership upgrade.
-- Additive: no owner assignment, legacy row rewrite, Storage grant or provider work.
-- Run the complete transaction as postgres only after reviewing the Phase 5 handoff.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare item record; begin
  if current_user<>'postgres' or to_regnamespace('account_ownership_backup_20261014') is null
    or to_regprocedure('public.account_owned_actor()') is null
    or to_regclass('public.account_request_limits') is null then raise exception 'OWNERSHIP_UPGRADE_REQUIRED'; end if;
  if to_regclass('public.account_editor_operations') is not null then raise exception 'EDITOR_ALREADY_STARTED'; end if;
  for item in select * from (values
    ('video_projects','id','uuid'),('video_projects','workspace_id','uuid'),('video_projects','topic','text'),
    ('video_projects','track_states','jsonb'),('video_projects','captions_enabled','bool'),
    ('scenes','id','uuid'),('scenes','project_id','text'),('scenes','account_project_id','uuid'),
    ('scenes','sequence_number','int4'),('scenes','voice_over_beat','text'),('scenes','final_video_prompt','text'),
    ('scenes','video_duration','numeric'),('scenes','trim_start','numeric'),
    ('media','id','uuid'),('media','project_id','uuid'),('media','media_type','text'),('media','status','text'),('media','duration_seconds','numeric'),
    ('timeline_items','id','uuid'),('timeline_items','project_id','uuid'),('timeline_items','media_id','uuid'),
    ('timeline_items','track_id','text'),('timeline_items','start_time','numeric'),('timeline_items','duration','numeric'),('timeline_items','trim_start','numeric')
  ) as expected(relation,col,kind) loop
    if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=item.relation and column_name=item.col and udt_name=item.kind) then raise exception 'EDITOR_SCHEMA_DRIFT'; end if;
  end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('workspaces','video_projects','scenes','media','timeline_items') and not c.relrowsecurity)
    or has_table_privilege('authenticated','public.scenes','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.timeline_items','INSERT,UPDATE,DELETE')
    or has_any_column_privilege('authenticated','public.scenes','INSERT,UPDATE')
    or has_any_column_privilege('authenticated','public.timeline_items','INSERT,UPDATE') then raise exception 'EDITOR_CONTAINMENT_REQUIRED'; end if;
end $$;

alter table public.video_projects add column account_editor_revision integer not null default 0 check(account_editor_revision>=0);
-- Only scenes created by this RPC can be removed by it. Existing scene metadata is preserved.
alter table public.scenes add column account_editor_created boolean not null default false;
create table public.account_editor_operations (
  id uuid primary key, actor_id uuid not null references auth.users(id),
  project_id uuid not null references public.video_projects(id),
  expected_revision integer not null, result_revision integer not null, fingerprint text not null
);
alter table public.account_editor_operations enable row level security;
revoke all on public.account_editor_operations from public,anon,authenticated,service_role;

create function public.read_owned_editor(p_project_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.account_owned_actor(); p record; result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  -- This lock makes the revision and child rows one consistent snapshot with saves.
  select v.* into p from public.video_projects v join public.workspaces w on w.id=v.workspace_id
    where v.id=p_project_id and w.user_id=actor for share of v;
  if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if (select count(*) from public.scenes where account_project_id=p_project_id)>200
    or (select count(*) from public.timeline_items where project_id=p_project_id)>200
    or (select count(*) from public.media where project_id=p_project_id and status='ready')>500 then raise exception 'EDITOR_LIMIT'; end if;
  select jsonb_build_object(
    'project',jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'topic',p.topic),
    'revision',p.account_editor_revision,
    'document',jsonb_build_object(
      'scenes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'voice_over_beat',s.voice_over_beat,
        'final_video_prompt',s.final_video_prompt,'video_duration',s.video_duration,'trim_start',coalesce(s.trim_start,0)) order by s.sequence_number,s.id)
        from public.scenes s where s.account_project_id=p_project_id),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'media_id',t.media_id,'track_id',t.track_id,
        'start_time',t.start_time,'duration',t.duration,'trim_start',t.trim_start) order by t.start_time,t.id)
        from public.timeline_items t where t.project_id=p_project_id),'[]'::jsonb),
      'settings',jsonb_build_object('captions_enabled',coalesce(p.captions_enabled,false),'track_states',coalesce(p.track_states,
        '{"V1":{"locked":false,"muted":false,"volume":1},"A1":{"locked":false,"muted":false,"volume":1},"A2":{"locked":false,"muted":false,"volume":1}}'::jsonb))),
    'removableSceneIds',coalesce((select jsonb_agg(s.id order by s.id) from public.scenes s where s.account_project_id=p_project_id and s.account_editor_created),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'media_type',m.media_type,'duration_seconds',m.duration_seconds) order by m.id)
      from public.media m where m.project_id=p_project_id and m.status='ready'),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.save_owned_editor(p_project_id uuid,p_revision integer,p_operation_id uuid,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.account_owned_actor(); current_revision integer; prior record; row_value jsonb; track jsonb;
  scene_id uuid; item_id uuid; media_id uuid; counter integer; ordinal integer:=0; digest text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select v.account_editor_revision into current_revision from public.video_projects v join public.workspaces w on w.id=v.workspace_id
    where v.id=p_project_id and w.user_id=actor for update of v;
  if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if p_operation_id is null or p_revision is null or p_revision<0 or p_revision>2147483646
    or p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>262144
    or not(p_document ?& array['scenes','items','settings']) or (p_document-array['scenes','items','settings'])<>'{}'::jsonb
    then raise exception 'INVALID_EDITOR'; end if;
  digest:=encode(sha256(convert_to(p_document::text,'UTF8')),'hex');
  select * into prior from public.account_editor_operations where id=p_operation_id;
  if found then
    if prior.actor_id<>actor or prior.project_id<>p_project_id or prior.expected_revision<>p_revision or prior.fingerprint<>digest then raise exception 'OPERATION_REUSED'; end if;
    return jsonb_build_object('operationId',p_operation_id,'revision',prior.result_revision);
  end if;
  if current_revision<>p_revision then raise exception 'EDITOR_CONFLICT'; end if;
  if jsonb_typeof(p_document->'scenes')<>'array' or jsonb_typeof(p_document->'items')<>'array'
    or jsonb_typeof(p_document->'settings')<>'object' then raise exception 'INVALID_EDITOR'; end if;
  if jsonb_array_length(p_document->'scenes')>200 or jsonb_array_length(p_document->'items')>200 then raise exception 'EDITOR_LIMIT'; end if;
  if not((p_document->'settings') ?& array['captions_enabled','track_states'])
    or ((p_document->'settings')-array['captions_enabled','track_states'])<>'{}'::jsonb
    or jsonb_typeof(p_document#>'{settings,captions_enabled}')<>'boolean'
    or jsonb_typeof(p_document#>'{settings,track_states}')<>'object'
    or not((p_document#>'{settings,track_states}') ?& array['V1','A1','A2'])
    or ((p_document#>'{settings,track_states}')-array['V1','A1','A2'])<>'{}'::jsonb then raise exception 'INVALID_EDITOR'; end if;
  for track in select value from jsonb_each(p_document#>'{settings,track_states}') loop
    if jsonb_typeof(track)<>'object' or not(track ?& array['locked','muted','volume'])
      or (track-array['locked','muted','volume'])<>'{}'::jsonb
      or jsonb_typeof(track->'locked')<>'boolean' or jsonb_typeof(track->'muted')<>'boolean'
      or jsonb_typeof(track->'volume')<>'number' then raise exception 'INVALID_EDITOR'; end if;
    if (track->>'volume')::numeric not between 0 and 1 then raise exception 'INVALID_EDITOR'; end if;
  end loop;
  for row_value in select value from jsonb_array_elements(p_document->'scenes') loop
    if jsonb_typeof(row_value)<>'object' or not(row_value ?& array['id','voice_over_beat','final_video_prompt','video_duration','trim_start'])
      or (row_value-array['id','voice_over_beat','final_video_prompt','video_duration','trim_start'])<>'{}'::jsonb
      or jsonb_typeof(row_value->'id')<>'string' or (row_value->>'id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(row_value->'voice_over_beat')<>'string' or length(row_value->>'voice_over_beat')>10000
      or jsonb_typeof(row_value->'final_video_prompt')<>'string' or length(row_value->>'final_video_prompt')>10000
      or jsonb_typeof(row_value->'video_duration')<>'number' or jsonb_typeof(row_value->'trim_start')<>'number' then raise exception 'INVALID_EDITOR'; end if;
    if (row_value->>'video_duration')::numeric not between 0.1 and 600 or (row_value->>'trim_start')::numeric not between 0 and 7200 then raise exception 'INVALID_EDITOR'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_document->'scenes'))<>jsonb_array_length(p_document->'scenes')
    or (select coalesce(sum((value->>'video_duration')::numeric),0) from jsonb_array_elements(p_document->'scenes'))>7200 then raise exception 'INVALID_EDITOR'; end if;
  for row_value in select value from jsonb_array_elements(p_document->'items') loop
    if jsonb_typeof(row_value)<>'object' or not(row_value ?& array['id','media_id','track_id','start_time','duration','trim_start'])
      or (row_value-array['id','media_id','track_id','start_time','duration','trim_start'])<>'{}'::jsonb
      or jsonb_typeof(row_value->'id')<>'string' or (row_value->>'id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(row_value->'media_id')<>'string' or (row_value->>'media_id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(row_value->>'track_id','') not in ('A1','A2') or jsonb_typeof(row_value->'track_id')<>'string'
      or jsonb_typeof(row_value->'start_time')<>'number' or jsonb_typeof(row_value->'duration')<>'number'
      or jsonb_typeof(row_value->'trim_start')<>'number' then raise exception 'INVALID_EDITOR'; end if;
    if (row_value->>'start_time')::numeric not between 0 and 7200 or (row_value->>'duration')::numeric not between 0.1 and 7200
      or (row_value->>'trim_start')::numeric not between 0 and 7200
      or (row_value->>'start_time')::numeric+(row_value->>'duration')::numeric>7200
      or (row_value->>'trim_start')::numeric+(row_value->>'duration')::numeric>7200 then raise exception 'INVALID_EDITOR'; end if;
    media_id:=(row_value->>'media_id')::uuid;
    if not exists(select 1 from public.media m where m.id=media_id and m.project_id=p_project_id and m.media_type='audio' and m.status='ready'
      and (m.duration_seconds is null or (row_value->>'trim_start')::numeric+(row_value->>'duration')::numeric<=m.duration_seconds)) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_document->'items'))<>jsonb_array_length(p_document->'items') then raise exception 'INVALID_EDITOR'; end if;
  -- Never let a client move another project's row by reusing its UUID.
  if exists(select 1 from public.scenes s join jsonb_array_elements(p_document->'scenes') e on s.id=(e->>'id')::uuid where s.account_project_id is distinct from p_project_id)
    or exists(select 1 from public.timeline_items t join jsonb_array_elements(p_document->'items') e on t.id=(e->>'id')::uuid where t.project_id is distinct from p_project_id) then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  if exists(select 1 from public.scenes s where s.account_project_id=p_project_id and not s.account_editor_created
    and not exists(select 1 from jsonb_array_elements(p_document->'scenes') e where (e->>'id')::uuid=s.id)) then raise exception 'EDITOR_SCENE_PROTECTED'; end if;
  if (select count(*) from public.account_editor_operations where project_id=p_project_id)>=10000 then raise exception 'EDITOR_LIMIT'; end if;
  insert into public.account_request_limits(actor_id,action,window_start,hits) values(actor,'editor',date_trunc('minute',now()),1)
    on conflict(actor_id,action,window_start) do update set hits=public.account_request_limits.hits+1 returning hits into counter;
  if counter>30 then raise exception 'REQUEST_RATE_LIMIT'; end if;
  delete from public.account_request_limits where actor_id=actor and action='editor' and window_start<now()-interval '24 hours';

  delete from public.scenes s where s.account_project_id=p_project_id and s.account_editor_created
    and not exists(select 1 from jsonb_array_elements(p_document->'scenes') e where (e->>'id')::uuid=s.id);
  for row_value in select value from jsonb_array_elements(p_document->'scenes') loop
    ordinal:=ordinal+1; scene_id:=(row_value->>'id')::uuid;
    insert into public.scenes(id,project_id,sequence_number,voice_over_beat,final_video_prompt,video_duration,trim_start,account_editor_created)
      values(scene_id,p_project_id::text,ordinal,row_value->>'voice_over_beat',row_value->>'final_video_prompt',
        (row_value->>'video_duration')::numeric,(row_value->>'trim_start')::numeric,true)
      on conflict(id) do update set sequence_number=excluded.sequence_number,voice_over_beat=excluded.voice_over_beat,
        final_video_prompt=excluded.final_video_prompt,video_duration=excluded.video_duration,trim_start=excluded.trim_start
        where scenes.account_project_id=p_project_id;
    if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  end loop;
  delete from public.timeline_items t where t.project_id=p_project_id
    and not exists(select 1 from jsonb_array_elements(p_document->'items') e where (e->>'id')::uuid=t.id);
  for row_value in select value from jsonb_array_elements(p_document->'items') loop
    item_id:=(row_value->>'id')::uuid;
    insert into public.timeline_items(id,project_id,media_id,track_id,start_time,duration,trim_start)
      values(item_id,p_project_id,(row_value->>'media_id')::uuid,row_value->>'track_id',(row_value->>'start_time')::numeric,
        (row_value->>'duration')::numeric,(row_value->>'trim_start')::numeric)
      on conflict(id) do update set media_id=excluded.media_id,track_id=excluded.track_id,start_time=excluded.start_time,
        duration=excluded.duration,trim_start=excluded.trim_start where timeline_items.project_id=p_project_id;
    if not found then raise exception 'RESOURCE_UNAVAILABLE'; end if;
  end loop;
  update public.video_projects set captions_enabled=(p_document#>>'{settings,captions_enabled}')::boolean,
    track_states=p_document#>'{settings,track_states}',account_editor_revision=current_revision+1 where id=p_project_id;
  insert into public.account_editor_operations values(p_operation_id,actor,p_project_id,p_revision,current_revision+1,digest);
  return jsonb_build_object('operationId',p_operation_id,'revision',current_revision+1);
end $$;
revoke all on function public.read_owned_editor(uuid),public.save_owned_editor(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_editor(uuid),public.save_owned_editor(uuid,integer,uuid,jsonb) to authenticated;
commit;
