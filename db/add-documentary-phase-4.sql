-- Phase 4 AFTER add-presentation-suggestions.sql. Local/staging review before activation.
-- No existing rows, source packets, Visuals selections or billing settings changed.
begin;
do $$ begin
  if to_regprocedure('public.documentary_image_slots_phase2(jsonb)') is null then
    alter function public.documentary_image_slots(jsonb) rename to documentary_image_slots_phase2;
  end if;
  if to_regprocedure('public.presentation_suggestion_snapshot_phase3(uuid)') is null then
    alter function public.presentation_suggestion_snapshot(uuid) rename to presentation_suggestion_snapshot_phase3;
  end if;
end $$;
revoke all on function public.documentary_image_slots_phase2(jsonb) from public,anon,authenticated;
revoke all on function public.presentation_suggestion_snapshot_phase3(uuid) from public,anon,authenticated;

create or replace function public.phase4_source_valid(p_source jsonb) returns boolean
language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_typeof(p_source)='object' and length(trim(p_source->>'credit')) between 1 and 90
    and p_source->>'classification' in ('unknown','historical','illustration','reconstruction')
    and length(p_source->>'url')<=1000 and ((p_source->>'url')='' or (p_source->>'url') ~* '^https?://'),false)
$$;
revoke all on function public.phase4_source_valid(jsonb) from public;

create or replace function public.documentary_image_slots(p_envelope jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare kind text:=p_envelope->>'templateId'; c jsonb:=p_envelope->'content'; item jsonb; last_cue numeric:=-1; smallest numeric; largest numeric;
begin
  if kind not in ('cause-effect','scale-comparison','fact-reveal','claim-evidence') or kind is null then
    return public.documentary_image_slots_phase2(p_envelope);
  end if;
  if jsonb_typeof(c) is distinct from 'object' then raise exception 'INVALID_PRESENTATION'; end if;
  case kind
    when 'cause-effect' then
      if jsonb_typeof(c->'steps') is distinct from 'array' or jsonb_array_length(c->'steps') not between 2 and 4
        or jsonb_typeof(c->'links') is distinct from 'array' or jsonb_array_length(c->'links')<>jsonb_array_length(c->'steps')-1 then raise exception 'INVALID_PRESENTATION'; end if;
      if (select count(distinct x->>'id') from jsonb_array_elements((c->'steps')||(c->'links')) x) <> jsonb_array_length(c->'steps')+jsonb_array_length(c->'links') then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(c->'steps') loop
        perform (item->>'id')::uuid;
        if not coalesce(length(trim(item->>'label')) between 1 and 55 and length(item->>'detail')<=100 and jsonb_typeof(item->'cueSeconds')='number' and (item->>'cueSeconds')::numeric>=last_cue and (item->>'cueSeconds')::numeric>=0,false) then raise exception 'INVALID_PRESENTATION'; end if;
        last_cue:=(item->>'cueSeconds')::numeric;
      end loop;
      for item in select value from jsonb_array_elements(c->'links') loop
        perform (item->>'id')::uuid;
        if not coalesce(item->>'type' in ('sequential','causal') and length(trim(item->>'label')) between 1 and 40 and length(item->>'support')<=140 and public.phase4_source_valid(item->'source'),false) then raise exception 'INVALID_PRESENTATION'; end if;
        if item->>'type'='causal' and not coalesce(length(trim(item->>'support'))>0 and item#>>'{source,classification}'='historical',false) then raise exception 'INVALID_PRESENTATION'; end if;
      end loop;
    when 'scale-comparison' then
      if not coalesce(c->>'dimension' in ('height','length') and c->>'method' in ('proportional','values-only'),false)
        or jsonb_typeof(c->'items') is distinct from 'array' or jsonb_array_length(c->'items') not between 2 and 3 then raise exception 'INVALID_PRESENTATION'; end if;
      if (select count(distinct x->>'id') from jsonb_array_elements(c->'items') x)<>jsonb_array_length(c->'items')
        or not exists(select 1 from jsonb_array_elements(c->'items') x where x->>'id'=c->>'referenceId') then raise exception 'INVALID_PRESENTATION'; end if;
      for item in select value from jsonb_array_elements(c->'items') loop
        perform (item->>'id')::uuid;
        if not coalesce(length(trim(item->>'label')) between 1 and 55 and jsonb_typeof(item->'value')='number' and (item->>'value')::numeric>0 and (item->>'value')::numeric<=1e12
          and item->>'unit' in ('mm','cm','m','km','in','ft') and jsonb_typeof(item->'approximate')='boolean' and public.phase4_source_valid(item->'source'),false) then raise exception 'INVALID_PRESENTATION'; end if;
      end loop;
      if c->>'method'='proportional' then
        select min(v),max(v) into smallest,largest from (select (x->>'value')::numeric * case x->>'unit' when 'mm' then .001 when 'cm' then .01 when 'm' then 1 when 'km' then 1000 when 'in' then .0254 when 'ft' then .3048 end as v from jsonb_array_elements(c->'items') x) measures;
        if smallest/largest < .06 then raise exception 'INVALID_PRESENTATION'; end if;
      end if;
    when 'fact-reveal' then
      if not coalesce(c->>'kind' in ('quantity','date','range') and length(trim(c->>'value')) between 1 and 45 and length(c->>'unit')<=20 and length(c->>'qualifier')<=30
        and length(trim(c->>'context')) between 1 and 140 and jsonb_typeof(c->'cueSeconds')='number' and (c->>'cueSeconds')::numeric>=0 and public.phase4_source_valid(c->'source'),false) then raise exception 'INVALID_PRESENTATION'; end if;
    when 'claim-evidence' then
      item:=c->'evidence';
      if not coalesce(length(trim(c->>'claim')) between 1 and 150 and c->>'scope' in ('supports','context-only')
        and length(trim(c->>'interpretation')) between 1 and 180 and length(trim(c->>'limitation')) between 1 and 140
        and jsonb_typeof(c->'cueSeconds')='number' and (c->>'cueSeconds')::numeric>=0 and item->>'kind' in ('passage','object','attributed')
        and length(trim(item->>'label')) between 1 and 75 and length(item->>'passage')<=280 and public.phase4_source_valid(item->'source'),false) then raise exception 'INVALID_PRESENTATION'; end if;
      if item->>'kind'='passage' and coalesce(length(trim(item->>'passage')),0)=0 then raise exception 'INVALID_PRESENTATION'; end if;
      if item->>'kind'='object' and jsonb_typeof(item->'image') is distinct from 'object' then raise exception 'INVALID_PRESENTATION'; end if;
      if item->>'kind'='attributed' and (c->>'scope'<>'context-only' or jsonb_typeof(item->'image') is distinct from 'null') then raise exception 'INVALID_PRESENTATION'; end if;
      if jsonb_typeof(item->'image')='object' then return jsonb_build_array(item->'image'); end if;
  end case;
  return '[]'::jsonb;
end $$;
revoke all on function public.documentary_image_slots(jsonb) from public;

-- Registry changes invalidate old suggestions; source facts and current overlays are unchanged.
create or replace function public.presentation_suggestion_snapshot(p_project uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; inputs jsonb;
begin
  snapshot:=public.presentation_suggestion_snapshot_phase3(p_project);
  inputs:=jsonb_set(snapshot->'inputs','{registryVersion}','2');
  return snapshot || jsonb_build_object('inputs',inputs,'inputHash',md5(inputs::text));
end $$;
revoke all on function public.presentation_suggestion_snapshot(uuid) from public;
grant execute on function public.presentation_suggestion_snapshot(uuid) to authenticated;

create or replace function public.mutate_presentation_visuals(p_scope text,p_id uuid,p_expected_revision integer,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision integer; blueprint jsonb; visual jsonb; next_revision integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_settings->>'version'='1' and p_settings->>'themeVersion'='2' and p_settings->>'themeId' in ('dark-documentary','parchment-archive') and p_settings->>'motionIntensity' in ('calm','standard','expressive') and p_settings->>'background' in ('plain','grid','paper','halo') and p_settings->>'density' in ('spacious','compact') and p_settings->>'dateConvention' in ('BCE/CE','BC/AD') and p_settings->>'cleanPreference' in ('balanced','clean-first','graphics-rich'),false) then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_object_keys(p_settings) key where key not in ('version','themeVersion','themeId','motionIntensity','background','density','dateConvention','cleanPreference','accent','allowedFamilies')) then raise exception 'INVALID_VISUALS'; end if;
  if p_settings ? 'accent' and p_settings->>'accent' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_VISUALS'; end if;
  if jsonb_typeof(p_settings->'allowedFamilies') is distinct from 'array' or jsonb_array_length(p_settings->'allowedFamilies') > 14 then raise exception 'INVALID_VISUALS'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_settings->'allowedFamilies') id where id not in ('historical-timeline','person-introduction','image-comparison','archival-explainer','map-locator','artifact-spotlight','detail-annotation','manuscript-highlight','text-translation','relationship-diagram','cause-effect','scale-comparison','fact-reveal','claim-evidence')) then raise exception 'INVALID_VISUALS'; end if;
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
commit;
