-- Phase 2, AFTER add-scene-template-presentations.sql and add-channel-blueprint.sql.
-- Apply only to a deliberately selected environment. Idempotent; no existing rows restyled.
begin;
alter table public.video_projects add column if not exists presentation_visual_settings jsonb;
alter table public.video_projects add column if not exists presentation_visual_revision integer not null default 0;

create or replace function public.documentary_image_slots(p_envelope jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare kind text := p_envelope->>'templateId'; content jsonb := p_envelope->'content'; slots jsonb := '[]'; item jsonb;
begin
  if jsonb_typeof(content) is distinct from 'object' then raise exception 'INVALID_PRESENTATION'; end if;
  case kind
    when 'clean' then null;
    when 'image-comparison' then
      if jsonb_typeof(content->'images') is distinct from 'array' or jsonb_array_length(content->'images') <> 2 then raise exception 'INVALID_PRESENTATION'; end if;
      slots := content->'images';
    when 'historical-timeline' then
      if jsonb_typeof(content->'events') is distinct from 'array' or jsonb_array_length(content->'events') not between 1 and 5 then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(content->'events') loop
        if item#>>'{date,year}' = '0' or item#>>'{date,endYear}' = '0' then raise exception 'INVALID_PRESENTATION'; end if;
        if jsonb_typeof(item->'image') = 'object' then slots := slots || jsonb_build_array(item->'image'); end if;
      end loop;
    when 'person-introduction' then
      if coalesce(length(content->>'name'),0) not between 1 and 80 or coalesce(length(content->>'role'),0) not between 1 and 80 then raise exception 'INVALID_PRESENTATION'; end if;
      if jsonb_typeof(content->'portrait') = 'object' then slots := jsonb_build_array(content->'portrait'); end if;
    when 'artifact-spotlight' then slots := jsonb_build_array(content->'image');
    when 'detail-annotation' then
      if jsonb_typeof(content->'regions') is distinct from 'array' or jsonb_array_length(content->'regions') not between 1 and 3 then raise exception 'INVALID_PRESENTATION'; end if;
      slots := jsonb_build_array(content->'image');
    when 'manuscript-highlight' then slots := jsonb_build_array(content->'image');
    when 'archival-explainer' then
      if coalesce(length(content->>'heading'),0) not between 1 and 100 or coalesce(length(content->>'body'),0) not between 1 and 550 then raise exception 'INVALID_PRESENTATION'; end if;
    when 'map-locator' then
      if content->>'mapId' is distinct from 'west-asia-v1' or jsonb_typeof(content->'markers') is distinct from 'array' or jsonb_array_length(content->'markers') not between 1 and 4 then raise exception 'INVALID_PRESENTATION'; end if;
    when 'text-translation' then
      if coalesce(length(content->>'original'),0) not between 1 and 200 or coalesce(length(content->>'translation'),0) not between 1 and 240 or coalesce(length(content#>>'{source,credit}'),0) = 0 then raise exception 'INVALID_PRESENTATION'; end if;
    when 'relationship-diagram' then
      if jsonb_typeof(content->'nodes') is distinct from 'array' or jsonb_array_length(content->'nodes') not between 2 and 6 or jsonb_typeof(content->'edges') is distinct from 'array' or jsonb_array_length(content->'edges') not between 1 and 7 then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(content->'nodes') loop
        if jsonb_typeof(item->'image') = 'object' then slots := slots || jsonb_build_array(item->'image'); end if;
      end loop;
    else raise exception 'INVALID_PRESENTATION';
  end case;
  return slots;
end $$;
revoke all on function public.documentary_image_slots(jsonb) from public;

create or replace function public.mutate_scene_presentation(
  p_project_id uuid, p_scene_id uuid, p_expected_id uuid, p_expected_revision integer,
  p_operation_id uuid, p_envelope jsonb, p_start numeric, p_duration numeric,
  p_duration_mode text, p_locked boolean, p_action text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_row public.overlay_clips%rowtype; previous_row jsonb; scene_row public.scenes%rowtype;
  fingerprint text; image jsonb; media_row public.media%rowtype; inventory text := ''; canonical jsonb; slots jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select s.* into scene_row from public.scenes s join public.video_projects p on p.id=s.project_id join public.workspaces w on w.id=p.workspace_id
    where s.id=p_scene_id and p.id=p_project_id and w.user_id=auth.uid() for update of s;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or p_action not in ('save','delete') or p_action is null then raise exception 'INVALID_PRESENTATION'; end if;
  fingerprint := md5(jsonb_build_object('action',p_action,'envelope',p_envelope,'start',p_start,'duration',p_duration,'mode',p_duration_mode,'locked',p_locked,'expectedId',p_expected_id,'expectedRevision',p_expected_revision)::text);
  select * into current_row from public.overlay_clips where scene_id=p_scene_id and kind='scene-template' for update;
  if found then
    if current_row.last_operation_id=p_operation_id then
      if current_row.last_operation_hash <> fingerprint then raise exception 'OPERATION_REUSED'; end if;
      return jsonb_build_object('row',to_jsonb(current_row),'previous',null,'replayed',true);
    end if;
    if current_row.id is distinct from p_expected_id or current_row.revision <> p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
    previous_row := to_jsonb(current_row);
  else
    if p_action='delete' and p_expected_id is not null then return jsonb_build_object('row',null,'previous',null,'replayed',true); end if;
    if p_expected_id is not null or p_expected_revision <> 0 then raise exception 'REVISION_CONFLICT'; end if;
  end if;
  if p_action='delete' then
    delete from public.overlay_clips where id=current_row.id;
    return jsonb_build_object('row',null,'previous',previous_row,'replayed',false);
  end if;
  if not coalesce(p_envelope->>'schemaVersion'='1' and p_envelope->>'templateVersion'='1'
    and p_envelope#>>'{theme,id}' in ('dark-documentary','parchment-archive') and p_envelope#>>'{theme,version}' in ('1','2') and p_envelope->>'variantId'='auto',false)
    or (p_envelope->>'templateId' not in ('clean','image-comparison') and p_envelope#>>'{theme,version}' <> '2')
    or p_start is null or p_duration is null or p_start < 0 or p_duration <= 0
    or p_start::text in ('NaN','Infinity','-Infinity') or p_duration::text in ('NaN','Infinity','-Infinity')
    or p_duration_mode not in ('fixed','scene-remainder') or p_duration_mode is null or p_locked is null then raise exception 'INVALID_PRESENTATION'; end if;
  slots := public.documentary_image_slots(p_envelope);
  for image in select value from jsonb_array_elements(slots) loop
    if jsonb_typeof(image) is distinct from 'object' or image#>>'{asset,kind}' is distinct from 'media' or coalesce(length(image->>'label'),0) not between 1 and 60 then raise exception 'INVALID_PRESENTATION'; end if;
    perform (image->>'id')::uuid;
    select * into media_row from public.media where id=(image#>>'{asset,mediaId}')::uuid and project_id=p_project_id and media_type='image' and status='ready' for share;
    if not found or media_row.url is null or not (media_row.url ~ '^https?://' or (media_row.url ~ '^/' and media_row.url !~ '^//')) then raise exception 'ASSET_NOT_READY'; end if;
    inventory := inventory || media_row.id::text || ':' || media_row.status || ';';
  end loop;
  canonical := jsonb_set(p_envelope,'{provenance}',jsonb_build_object('scriptHash',md5(coalesce(scene_row.voice_over_beat,'')),'assetInventoryHash',md5(inventory)));
  if current_row.id is null then
    insert into public.overlay_clips(project_id,scene_id,kind,time_basis,duration_mode,start_time,duration,text,preset,origin,locked,template_data,last_operation_id,last_operation_hash)
      values(p_project_id,p_scene_id,'scene-template','scene',p_duration_mode,p_start,p_duration,'','none','user',p_locked,canonical,p_operation_id,fingerprint) returning * into current_row;
  else
    update public.overlay_clips set template_data=canonical,start_time=p_start,duration=p_duration,duration_mode=p_duration_mode,revision=revision+1,locked=p_locked,last_operation_id=p_operation_id,last_operation_hash=fingerprint,updated_at=now() where id=current_row.id returning * into current_row;
  end if;
  return jsonb_build_object('row',to_jsonb(current_row),'previous',previous_row,'replayed',false);
end $$;
revoke all on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) from public;
grant execute on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) to authenticated;

create or replace function public.mutate_presentation_visuals(p_scope text,p_id uuid,p_expected_revision integer,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision integer; blueprint jsonb; visual jsonb; next_revision integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_settings->>'version'='1' and p_settings->>'themeVersion'='2' and p_settings->>'themeId' in ('dark-documentary','parchment-archive') and p_settings->>'motionIntensity' in ('calm','standard','expressive') and p_settings->>'background' in ('plain','grid','paper','halo') and p_settings->>'density' in ('spacious','compact') and p_settings->>'dateConvention' in ('BCE/CE','BC/AD') and p_settings->>'cleanPreference' in ('balanced','clean-first','graphics-rich'),false) then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_object_keys(p_settings) key where key not in ('version','themeVersion','themeId','motionIntensity','background','density','dateConvention','cleanPreference','accent','allowedFamilies')) then raise exception 'INVALID_VISUALS'; end if;
  if p_settings ? 'accent' and p_settings->>'accent' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_VISUALS'; end if;
  if jsonb_typeof(p_settings->'allowedFamilies') is distinct from 'array' or jsonb_array_length(p_settings->'allowedFamilies') > 10 then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_settings->'allowedFamilies') id where id not in ('historical-timeline','person-introduction','image-comparison','archival-explainer','map-locator','artifact-spotlight','detail-annotation','manuscript-highlight','text-translation','relationship-diagram')) then raise exception 'INVALID_VISUALS'; end if;
  if (select count(distinct id) from jsonb_array_elements_text(p_settings->'allowedFamilies') id) <> jsonb_array_length(p_settings->'allowedFamilies') then raise exception 'INVALID_VISUALS'; end if;
  if p_scope='workspace' then
    select coalesce(format_blueprint_version,0),coalesce(format_blueprint,'{}') into current_revision,blueprint from public.workspaces where id=p_id and user_id=auth.uid() for update;
    if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
    if p_expected_revision is distinct from current_revision then raise exception 'REVISION_CONFLICT'; end if;
    next_revision := current_revision+1;
    visual := coalesce(blueprint->'visual','{}') || jsonb_build_object('presentation',p_settings);
    update public.workspaces set format_blueprint=blueprint || jsonb_build_object('visual',visual),format_blueprint_version=next_revision where id=p_id;
  elsif p_scope='project' then
    select p.presentation_visual_revision into current_revision from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_id and w.user_id=auth.uid() for update of p;
    if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
    if p_expected_revision is distinct from current_revision then raise exception 'REVISION_CONFLICT'; end if;
    next_revision := current_revision+1;
    update public.video_projects set presentation_visual_settings=p_settings,presentation_visual_revision=next_revision where id=p_id;
  else raise exception 'INVALID_VISUALS'; end if;
  return jsonb_build_object('settings',p_settings,'revision',next_revision);
end $$;
revoke all on function public.mutate_presentation_visuals(text,uuid,integer,jsonb) from public;
grant execute on function public.mutate_presentation_visuals(text,uuid,integer,jsonb) to authenticated;

-- Format saves preserve the independently edited presentation subtree and reject stale tabs.
create or replace function public.save_channel_format_cas(p_id uuid,p_expected_revision integer,p_patch jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.workspaces%rowtype; replacement jsonb; presentation jsonb; next_revision integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into existing from public.workspaces where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if p_expected_revision is distinct from coalesce(existing.format_blueprint_version,0) then raise exception 'REVISION_CONFLICT'; end if;
  presentation := existing.format_blueprint#>'{visual,presentation}';
  replacement := case when p_patch ? 'format_blueprint' then coalesce(nullif(p_patch->'format_blueprint','null'::jsonb),'{}') else coalesce(existing.format_blueprint,'{}') end;
  if jsonb_typeof(replacement) is distinct from 'object' then raise exception 'INVALID_FORMAT'; end if;
  replacement := replacement #- '{visual,presentation}';
  if presentation is not null then replacement := replacement || jsonb_build_object('visual',coalesce(replacement->'visual','{}') || jsonb_build_object('presentation',presentation)); end if;
  next_revision := coalesce(existing.format_blueprint_version,0)+1;
  update public.workspaces set format_blueprint=replacement,format_blueprint_version=next_revision,
    format_preset_key=case when p_patch ? 'format_preset_key' then p_patch->>'format_preset_key' else existing.format_preset_key end where id=p_id;
  return next_revision;
end $$;
revoke all on function public.save_channel_format_cas(uuid,integer,jsonb) from public;
grant execute on function public.save_channel_format_cas(uuid,integer,jsonb) to authenticated;

create or replace function public.guard_presentation_visual_write() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_table_name='workspaces' then
      if new.format_blueprint is distinct from old.format_blueprint or new.format_blueprint_version is distinct from old.format_blueprint_version or new.format_preset_key is distinct from old.format_preset_key then raise exception 'USE_FORMAT_VISUAL_SERVICE'; end if;
    elsif new.presentation_visual_settings is distinct from old.presentation_visual_settings or new.presentation_visual_revision is distinct from old.presentation_visual_revision then raise exception 'USE_FORMAT_VISUAL_SERVICE'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_channel_presentation_visuals on public.workspaces;
create trigger guard_channel_presentation_visuals before update on public.workspaces for each row execute function public.guard_presentation_visual_write();
drop trigger if exists guard_project_presentation_visuals on public.video_projects;
create trigger guard_project_presentation_visuals before update on public.video_projects for each row execute function public.guard_presentation_visual_write();
commit;
