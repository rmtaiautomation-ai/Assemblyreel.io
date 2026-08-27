-- Thumbnail generator — per-project thumbnail candidates, on-brand via the
-- channel's FormatProfile.
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- every other db/add-*.sql in this folder. Run AFTER create-media-and-timeline-items.sql
-- (depends on the `media` table) and add-channel-blueprint.sql (mirrors its
-- format_blueprint_snapshot freeze convention).
--
-- Two generation moments are supported on the same table, distinguished by `pass`:
--   'concept' — before render exists, built from a scene's already-generated
--               visuals/character art (no real footage yet).
--   'final'   — after render, built from an actual frame extracted from the
--               finished mp4.
-- Both produce a composited image (subject + bold text/graphic overlay) via the
-- same agent/compositing code path; only the source of the reference image differs.

create table if not exists public.thumbnails (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,

  pass text not null check (pass in ('concept', 'final')),
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),

  -- The candidate frame/key-art this thumbnail was composited from.
  source_kind text not null check (source_kind in ('rendered_frame', 'key_art')),
  source_media_id uuid references public.media(id) on delete set null,
  source_scene_id uuid references public.scenes(id) on delete set null,
  source_timestamp_seconds numeric, -- which frame of the final mp4, when source_kind = 'rendered_frame'

  -- The final composited output (subject + text/graphic overlay), stored as its
  -- own media row so it reuses the existing asset lifecycle/cleanup.
  composited_media_id uuid references public.media(id) on delete set null,

  -- What the thumbnail-composer agent decided, kept for regeneration/audit and
  -- for the drift check called out in implementation_plans (comparing style
  -- across a channel's recent thumbnails).
  headline_text text,
  concept_notes jsonb default '{}'::jsonb,

  -- Frozen FormatProfile used to generate this thumbnail — same convention as
  -- video_projects.format_blueprint_snapshot. Every thumbnail agent reads this,
  -- never the live workspace blueprint, so an in-flight channel-format edit
  -- can't retroactively restyle an already-generated thumbnail.
  format_blueprint_snapshot jsonb,

  is_selected boolean not null default false, -- the variant chosen as "the" thumbnail for this video
  provider_model text,
  error_message text,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists thumbnails_project_id_idx on public.thumbnails(project_id);

-- RLS: same join-through pattern as scenes (video_projects.workspace_id -> workspaces.user_id).
alter table public.thumbnails enable row level security;

create policy "Users can view own thumbnails." on public.thumbnails for select using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can insert own thumbnails." on public.thumbnails for insert with check (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can update own thumbnails." on public.thumbnails for update using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);
create policy "Users can delete own thumbnails." on public.thumbnails for delete using (
  auth.uid() = (select user_id from public.workspaces join public.video_projects on public.workspaces.id = public.video_projects.workspace_id where public.video_projects.id = project_id)
);

-- --------------------------------------------------------------------------------
-- Final-pass thumbnails source a real extracted video frame, which is not an AI
-- generation — add a value for it alongside the existing media.source options.
-- Run AFTER add-preset-media-source.sql — this carries its 'preset' value forward.
-- --------------------------------------------------------------------------------
alter table public.media drop constraint if exists media_source_check;
alter table public.media add constraint media_source_check
  check (source in ('upload', 'fal', 'gemini', 'stock', 'stock-fallback', 'mock', 'legacy-unknown', 'preset', 'ffmpeg-frame'));
