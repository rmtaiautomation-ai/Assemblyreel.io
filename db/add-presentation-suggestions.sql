-- Phase 3 AFTER the Phase 2 migration. Review and select an environment before applying.
-- No provider activation, subscriptions, automatic scene replacement or row conversion.
begin;
create table if not exists public.presentation_evidence (
  id uuid primary key, project_id uuid not null references public.video_projects(id) on delete cascade,
  title text not null check(length(title) between 1 and 90), envelope jsonb not null,
  revision integer not null default 1 check(revision > 0), reviewed_by uuid not null,
  reviewed_at timestamptz not null default now()
);
create table if not exists public.presentation_suggestion_runs (
  id uuid primary key, project_id uuid not null references public.video_projects(id) on delete cascade,
  requested_by uuid not null, target_scene_ids uuid[] not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{32}$'),
  state text not null check(state in ('running','generated','complete','failed','unknown')),
  result jsonb, error_code text, billing_operation_id uuid, provider_request_id text,
  created_at timestamptz not null default now(),
  check(cardinality(target_scene_ids) between 1 and 48)
);
create index if not exists presentation_evidence_project_idx on public.presentation_evidence(project_id);
alter table public.presentation_suggestion_runs add column if not exists include_manual boolean not null default false;
create index if not exists presentation_suggestion_runs_project_idx on public.presentation_suggestion_runs(project_id,created_at desc);
alter table public.presentation_evidence enable row level security;
alter table public.presentation_suggestion_runs enable row level security;
drop policy if exists owned_evidence_read on public.presentation_evidence;
create policy owned_evidence_read on public.presentation_evidence for select to authenticated using (
  exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=auth.uid())
);
drop policy if exists owned_suggestion_read on public.presentation_suggestion_runs;
create policy owned_suggestion_read on public.presentation_suggestion_runs for select to authenticated using (
  exists(select 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=project_id and w.user_id=auth.uid())
);
revoke all on public.presentation_evidence,public.presentation_suggestion_runs from public,anon,authenticated;
grant select on public.presentation_evidence,public.presentation_suggestion_runs to authenticated;
grant select,insert,update on public.presentation_suggestion_runs to service_role;

create or replace function public.mutate_presentation_evidence(p_project uuid,p_id uuid,p_revision integer,p_title text,p_envelope jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_row public.presentation_evidence%rowtype; image jsonb; slots jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_project and w.user_id=auth.uid() for update of p;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if p_id is null or p_revision is null or p_revision<0 or p_delete is null then raise exception 'INVALID_EVIDENCE'; end if;
  select * into current_row from public.presentation_evidence where id=p_id for update;
  if found and current_row.project_id<>p_project then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if current_row.id is not null and p_revision=0 and not p_delete and current_row.revision=1 and current_row.title=p_title and current_row.envelope=p_envelope then return to_jsonb(current_row); end if;
  if coalesce(current_row.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_delete then delete from public.presentation_evidence where id=p_id; return null; end if;
  if coalesce(length(trim(p_title)),0) not between 1 and 90 or p_envelope->>'templateId'='clean'
    or p_envelope->>'schemaVersion' is distinct from '1' or p_envelope->>'templateVersion' is distinct from '1' then raise exception 'INVALID_EVIDENCE'; end if;
  slots:=public.documentary_image_slots(p_envelope);
  for image in select value from jsonb_array_elements(slots) loop
    if not exists(select 1 from public.media m where m.id=(image#>>'{asset,mediaId}')::uuid and m.project_id=p_project and m.media_type='image' and m.status='ready'
      and (m.url ~ '^https?://' or (m.url ~ '^/' and m.url !~ '^//'))) then raise exception 'ASSET_NOT_READY'; end if;
  end loop;
  if current_row.id is null then
    if (select count(*) from public.presentation_evidence where project_id=p_project)>=30 then raise exception 'EVIDENCE_LIMIT'; end if;
    insert into public.presentation_evidence(id,project_id,title,envelope,reviewed_by) values(p_id,p_project,p_title,p_envelope,auth.uid()) returning * into current_row;
  else update public.presentation_evidence set title=p_title,envelope=p_envelope,revision=revision+1,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id returning * into current_row; end if;
  return to_jsonb(current_row);
end $$;
revoke all on function public.mutate_presentation_evidence(uuid,uuid,integer,text,jsonb,boolean) from public;
grant execute on function public.mutate_presentation_evidence(uuid,uuid,integer,text,jsonb,boolean) to authenticated;

-- One statement snapshot. Hash covers scripts/order/timing/narration, media, reviewed
-- evidence, frozen facts/format and project styling. Target presentation identity/revision
-- is separately checked so an act's own earlier applies do not stale all later scenes.
create or replace function public.presentation_suggestion_snapshot(p_project uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare project_json jsonb; inputs jsonb; narration jsonb:='[]'; presentations jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select jsonb_build_object('id',p.id,'topic',to_jsonb(p)->'topic','format',to_jsonb(p)->'format_blueprint_snapshot',
    'facts',to_jsonb(p)->'channel_facts_snapshot','visuals',p.presentation_visual_settings,
    'words',to_jsonb(p)->'narration_words','audio',to_jsonb(p)->'narration_url','ratio',to_jsonb(p)->'aspect_ratio','captions',to_jsonb(p)->'captions_enabled') into project_json
    from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_project and w.user_id=auth.uid();
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if to_regclass('public.act_narrations') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''act'',act_number,''words'',word_timings,''audio'',audio_url,''start'',start_seconds,''duration'',duration_seconds) order by act_number),''[]''::jsonb) from public.act_narrations where project_id=$1' into narration using p_project;
  end if;
  select coalesce(jsonb_agg(to_jsonb(o) order by o.scene_id),'[]') into presentations from public.overlay_clips o where o.project_id=p_project and o.kind='scene-template';
  inputs:=jsonb_build_object('registryVersion',1,'project',project_json,'narrations',narration,
    'scenes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'text',coalesce(s.voice_over_beat,''),'duration',s.video_duration,
      'sequence',to_jsonb(s)->'sequence_number','act',to_jsonb(s)->'act_number','mediaId',to_jsonb(s)->'media_id',
      'mediaUrl',to_jsonb(s)->'custom_media_url','mediaType',to_jsonb(s)->'custom_media_type') order by coalesce((to_jsonb(s)->>'sequence_number')::int,0),s.id),'[]') from public.scenes s where s.project_id=p_project),
    'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'projectId',m.project_id,'url',coalesce(m.url,''),'mediaType',m.media_type,'status',m.status,'name',coalesce(to_jsonb(m)->>'original_filename','Project media'),
      'updatedAt',to_jsonb(m)->'updated_at','storagePath',to_jsonb(m)->'storage_path') order by m.id),'[]') from public.media m where m.project_id=p_project),
    'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'project_id',e.project_id,'title',e.title,'revision',e.revision,'envelope',e.envelope) order by e.id),'[]') from public.presentation_evidence e where e.project_id=p_project));
  return jsonb_build_object('inputHash',md5(inputs::text),'inputs',inputs,'presentations',presentations);
end $$;
revoke all on function public.presentation_suggestion_snapshot(uuid) from public;
grant execute on function public.presentation_suggestion_snapshot(uuid) to authenticated;

-- Keep the existing CAS implementation private. Manual writes always restore user
-- origin, including edits made to an AI-applied row. This is idempotent on rerun.
do $$ begin
  if to_regprocedure('public.mutate_scene_presentation_core(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text)') is null then
    alter function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) rename to mutate_scene_presentation_core;
  end if;
end $$;
revoke all on function public.mutate_scene_presentation_core(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) from public,authenticated,anon;
alter table public.overlay_clips add column if not exists suggestion_run_id uuid references public.presentation_suggestion_runs(id) on delete set null;
alter table public.overlay_clips add column if not exists suggestion_candidate_id text;
create or replace function public.mutate_scene_presentation(
  p_project_id uuid,p_scene_id uuid,p_expected_id uuid,p_expected_revision integer,p_operation_id uuid,p_envelope jsonb,
  p_start numeric,p_duration numeric,p_duration_mode text,p_locked boolean,p_action text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; canonical jsonb;
begin
  result:=public.mutate_scene_presentation_core(p_project_id,p_scene_id,p_expected_id,p_expected_revision,p_operation_id,p_envelope,p_start,p_duration,p_duration_mode,p_locked,p_action);
  if p_action='save' and coalesce((result->>'replayed')::boolean,false)=false then
    update public.overlay_clips set origin='user',suggestion_run_id=null,suggestion_candidate_id=null where id=(result#>>'{row,id}')::uuid returning to_jsonb(overlay_clips.*) into canonical;
    result:=jsonb_set(result,'{row}',canonical);
  end if;
  return result;
end $$;
revoke all on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) from public;
grant execute on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) to authenticated;

create or replace function public.apply_presentation_suggestion(p_project uuid,p_scene uuid,p_run uuid,p_candidate text,p_operation uuid,p_allow_manual boolean default false,p_draft jsonb default null,p_draft_timing jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare run public.presentation_suggestion_runs%rowtype; proposal jsonb; choice jsonb; existing public.overlay_clips%rowtype; result jsonb; canonical jsonb; envelope jsonb; timing jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  -- Evidence/default writes also lock the project, so they cannot cross the
  -- source-snapshot check while this application is in progress.
  perform 1 from public.video_projects p join public.workspaces w on w.id=p.workspace_id where p.id=p_project and w.user_id=auth.uid() for share of p;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  perform 1 from public.scenes s join public.video_projects p on p.id=s.project_id join public.workspaces w on w.id=p.workspace_id
    where s.id=p_scene and p.id=p_project and w.user_id=auth.uid() for update of s;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  select * into run from public.presentation_suggestion_runs where id=p_run and project_id=p_project and requested_by=auth.uid();
  if not found or run.state<>'complete' then raise exception 'SUGGESTION_NOT_READY'; end if;
  select value into proposal from jsonb_array_elements(run.result->'scenes') where value->>'sceneId'=p_scene::text;
  select value into choice from jsonb_array_elements(proposal->'choices') where value->>'id'=p_candidate;
  if proposal is null or choice is null or p_operation is null or (p_draft is null and (choice->>'status'<>'ready' or choice->'envelope'='null'::jsonb)) then raise exception 'SUGGESTION_NOT_READY'; end if;
  envelope:=coalesce(p_draft,choice->'envelope'); timing:=coalesce(p_draft_timing,choice->'timing');
  select * into existing from public.overlay_clips where scene_id=p_scene and kind='scene-template' for update;
  if existing.last_operation_id=p_operation then
    if existing.suggestion_run_id is distinct from p_run or existing.suggestion_candidate_id is distinct from p_candidate then raise exception 'OPERATION_REUSED'; end if;
    return public.mutate_scene_presentation_core(p_project,p_scene,(proposal->>'expectedId')::uuid,(proposal->>'expectedRevision')::integer,p_operation,
      envelope,(timing->>'start_time')::numeric,(timing->>'duration')::numeric,timing->>'duration_mode',true,'save');
  end if;
  if existing.locked then raise exception 'PRESENTATION_LOCKED'; end if;
  if existing.origin='user' and p_allow_manual is distinct from true then raise exception 'MANUAL_REVIEW_REQUIRED'; end if;
  perform 1 from public.media where project_id=p_project for share;
  if (public.presentation_suggestion_snapshot(p_project)->>'inputHash') is distinct from run.input_hash then raise exception 'STALE_SUGGESTION'; end if;
  result:=public.mutate_scene_presentation_core(p_project,p_scene,(proposal->>'expectedId')::uuid,(proposal->>'expectedRevision')::integer,p_operation,
    envelope,(timing->>'start_time')::numeric,(timing->>'duration')::numeric,timing->>'duration_mode',true,'save');
  update public.overlay_clips set origin=case when p_draft is null then 'ai' else 'user' end,suggestion_run_id=p_run,suggestion_candidate_id=p_candidate where id=(result#>>'{row,id}')::uuid returning to_jsonb(overlay_clips.*) into canonical;
  return jsonb_set(result,'{row}',canonical);
end $$;
revoke all on function public.apply_presentation_suggestion(uuid,uuid,uuid,text,uuid,boolean,jsonb,jsonb) from public;
grant execute on function public.apply_presentation_suggestion(uuid,uuid,uuid,text,uuid,boolean,jsonb,jsonb) to authenticated;
commit;
