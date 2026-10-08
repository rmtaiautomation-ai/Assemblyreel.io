-- Phase 1. Additive migration; review/run in the selected Supabase environment.
-- Requires scenes, workspaces, video_projects, media, and the three overlay migrations.
-- Authentication is required for presentation writes. No subscription is required.
begin;

alter table public.overlay_clips
  add column if not exists scene_id uuid,
  add column if not exists time_basis text not null default 'project',
  add column if not exists duration_mode text not null default 'fixed',
  add column if not exists revision integer not null default 1,
  add column if not exists locked boolean not null default false,
  add column if not exists last_operation_id uuid,
  add column if not exists last_operation_hash text;

create unique index if not exists scenes_id_project_unique on public.scenes(id, project_id);
create unique index if not exists one_presentation_per_scene on public.overlay_clips(scene_id) where kind = 'scene-template';
create index if not exists presentation_project_scene_idx on public.overlay_clips(project_id, scene_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presentation_scene_project_fk' and conrelid = 'public.overlay_clips'::regclass) then
    alter table public.overlay_clips add constraint presentation_scene_project_fk
      foreign key (scene_id, project_id) references public.scenes(id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'presentation_attachment_check' and conrelid = 'public.overlay_clips'::regclass) then
    alter table public.overlay_clips add constraint presentation_attachment_check check (
      revision >= 1 and (
        (kind = 'scene-template' and scene_id is not null and time_basis = 'scene'
          and start_time >= 0 and duration > 0 and duration_mode in ('fixed', 'scene-remainder')
          and jsonb_typeof(template_data) = 'object')
        or (kind <> 'scene-template' and scene_id is null and time_basis = 'project' and duration_mode = 'fixed')
      )
    );
  end if;
end $$;

-- Legacy rows retain their shape. All overlay access is now project-owned;
-- anonymous development clients must authenticate before editing after rollout.
alter table public.overlay_clips enable row level security;
-- Restrictive ownership also constrains any older permissive policies.
drop policy if exists presentation_owner_guard on public.overlay_clips;
create policy presentation_owner_guard on public.overlay_clips as restrictive for all to public using (
  exists (select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
          where p.id = overlay_clips.project_id and w.user_id = auth.uid())
) with check (
  exists (select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
          where p.id = overlay_clips.project_id and w.user_id = auth.uid())
);
drop policy if exists presentation_owned_read on public.overlay_clips;
create policy presentation_owned_read on public.overlay_clips for select to authenticated using (
  exists (select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
          where p.id = overlay_clips.project_id and w.user_id = auth.uid())
);
drop policy if exists presentation_legacy_write on public.overlay_clips;
create policy presentation_legacy_write on public.overlay_clips for all to authenticated using (
  kind <> 'scene-template' and exists (select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
          where p.id = overlay_clips.project_id and w.user_id = auth.uid())
) with check (
  kind <> 'scene-template' and exists (select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
          where p.id = overlay_clips.project_id and w.user_id = auth.uid())
);

create or replace function public.mutate_scene_presentation(
  p_project_id uuid, p_scene_id uuid, p_expected_id uuid, p_expected_revision integer,
  p_operation_id uuid, p_envelope jsonb, p_start numeric, p_duration numeric,
  p_duration_mode text, p_locked boolean, p_action text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_row public.overlay_clips%rowtype;
  previous_row jsonb;
  scene_row public.scenes%rowtype;
  fingerprint text;
  image jsonb;
  media_row public.media%rowtype;
  inventory text := '';
  canonical jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  -- Serialize insert/replace/delete on the scene, including first inserts.
  select s.* into scene_row from public.scenes s
    join public.video_projects p on p.id = s.project_id join public.workspaces w on w.id = p.workspace_id
    where s.id = p_scene_id and p.id = p_project_id and w.user_id = auth.uid() for update of s;
  if not found then raise exception 'OWNERSHIP_REQUIRED'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_action not in ('save', 'delete') or p_action is null then raise exception 'INVALID_PRESENTATION'; end if;
  fingerprint := md5(jsonb_build_object('action', p_action, 'envelope', p_envelope, 'start', p_start,
    'duration', p_duration, 'mode', p_duration_mode, 'locked', p_locked,
    'expectedId', p_expected_id, 'expectedRevision', p_expected_revision)::text);
  select * into current_row from public.overlay_clips where scene_id = p_scene_id and kind = 'scene-template' for update;
  if found then
    if current_row.last_operation_id = p_operation_id then
      if current_row.last_operation_hash <> fingerprint then raise exception 'OPERATION_REUSED'; end if;
      return jsonb_build_object('row', to_jsonb(current_row), 'previous', null, 'replayed', true);
    end if;
    if current_row.id is distinct from p_expected_id or current_row.revision <> p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
    previous_row := to_jsonb(current_row);
  else
    if p_action = 'delete' and p_expected_id is not null then
      return jsonb_build_object('row', null, 'previous', null, 'replayed', true);
    end if;
    if p_expected_id is not null or p_expected_revision <> 0 then raise exception 'REVISION_CONFLICT'; end if;
  end if;
  if p_action = 'delete' then
    delete from public.overlay_clips where id = current_row.id;
    return jsonb_build_object('row', null, 'previous', previous_row, 'replayed', false);
  end if;
  if not coalesce(p_envelope ->> 'schemaVersion' = '1' and p_envelope ->> 'templateVersion' = '1'
    and p_envelope ->> 'templateId' in ('image-comparison', 'clean')
    and p_envelope #>> '{theme,id}' in ('dark-documentary', 'parchment-archive')
    and p_envelope #>> '{theme,version}' = '1' and p_envelope ->> 'variantId' = 'auto', false)
    or p_start is null or p_duration is null or p_start < 0 or p_duration <= 0
    or p_start::text in ('NaN', 'Infinity', '-Infinity') or p_duration::text in ('NaN', 'Infinity', '-Infinity')
    or p_duration_mode not in ('fixed', 'scene-remainder') or p_duration_mode is null or p_locked is null then
    raise exception 'INVALID_PRESENTATION';
  end if;
  if p_envelope ->> 'templateId' = 'image-comparison' then
    if jsonb_typeof(p_envelope #> '{content,images}') is distinct from 'array' then raise exception 'INVALID_PRESENTATION'; end if;
    if jsonb_array_length(p_envelope #> '{content,images}') <> 2 then raise exception 'INVALID_PRESENTATION'; end if;
    for image in select value from jsonb_array_elements(p_envelope #> '{content,images}') loop
      if image #>> '{asset,kind}' is distinct from 'media' or coalesce(length(image ->> 'label'), 0) not between 1 and 60 then raise exception 'INVALID_PRESENTATION'; end if;
      select * into media_row from public.media where id = (image #>> '{asset,mediaId}')::uuid
        and project_id = p_project_id and media_type = 'image' and status = 'ready' for share;
      if not found or media_row.url is null or not (media_row.url ~ '^https?://' or (media_row.url ~ '^/' and media_row.url !~ '^//')) then raise exception 'ASSET_NOT_READY'; end if;
      inventory := inventory || media_row.id::text || ':' || media_row.status || ';';
    end loop;
  end if;
  -- Provenance comes from current server data, never a supplied review assertion.
  canonical := jsonb_set(p_envelope, '{provenance}', jsonb_build_object(
    'scriptHash', md5(coalesce(scene_row.voice_over_beat, '')), 'assetInventoryHash', md5(inventory)));
  if current_row.id is null then
    insert into public.overlay_clips(project_id, scene_id, kind, time_basis, duration_mode, start_time, duration,
      text, preset, origin, locked, template_data, last_operation_id, last_operation_hash)
    values(p_project_id, p_scene_id, 'scene-template', 'scene', p_duration_mode, p_start, p_duration,
      '', 'none', 'user', p_locked, canonical, p_operation_id, fingerprint) returning * into current_row;
  else
    update public.overlay_clips set template_data = canonical, start_time = p_start, duration = p_duration,
      duration_mode = p_duration_mode, revision = revision + 1, locked = p_locked,
      last_operation_id = p_operation_id, last_operation_hash = fingerprint, updated_at = now()
    where id = current_row.id returning * into current_row;
  end if;
  return jsonb_build_object('row', to_jsonb(current_row), 'previous', previous_row, 'replayed', false);
end $$;
revoke all on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) from public;
grant execute on function public.mutate_scene_presentation(uuid,uuid,uuid,integer,uuid,jsonb,numeric,numeric,text,boolean,text) to authenticated;

-- Old permissive policies cannot bypass the CAS service for the new kind.
create or replace function public.guard_attached_presentation_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') and
    ((tg_op <> 'INSERT' and old.kind = 'scene-template') or (tg_op <> 'DELETE' and new.kind = 'scene-template')) then
    -- FK cascades are allowed only for the actor's own scene/project.
    if tg_op <> 'DELETE' or pg_trigger_depth() = 1 or not exists (
      select 1 from public.video_projects p join public.workspaces w on w.id = p.workspace_id
      where p.id = old.project_id and w.user_id = auth.uid()
    ) then raise exception 'USE_PRESENTATION_SERVICE'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists guard_attached_presentation_write on public.overlay_clips;
create trigger guard_attached_presentation_write before insert or update or delete on public.overlay_clips
  for each row execute function public.guard_attached_presentation_write();

commit;
