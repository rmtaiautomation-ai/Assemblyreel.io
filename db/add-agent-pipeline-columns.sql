-- 7-Agent pipeline columns (implementation_plans/03-native-agent-orchestration.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-narration-url-column.sql and add-track-states-column.sql.
--
-- Until this runs, generation still works: the orchestrator writes
-- scenes.final_video_prompt (which already exists) in its own statement, and this
-- metadata is written separately as best-effort. You will see a warning naming this
-- file rather than a failed generation.

-- --------------------------------------------------------------------------------
-- Scene-level output from Agents 2, 4 and 5.
-- Persisted so a single scene can be regenerated later without re-running the whole
-- pipeline, and so the editor can show WHY a prompt looks the way it does.
-- --------------------------------------------------------------------------------
alter table public.scenes
  add column if not exists scene_type text,
  add column if not exists environment text,
  add column if not exists lighting text,
  add column if not exists camera_direction text;

comment on column public.scenes.scene_type is
  'Agent 2 (Scene Slicer): ESTABLISH | ACTION | DIALOGUE | DIVINE | CLOSEUP | MACRO | WIDE';
comment on column public.scenes.environment is
  'Agent 4 (Visual Architect): the physical setting of this scene.';
comment on column public.scenes.lighting is
  'Agent 4 (Visual Architect): light quality and direction.';
comment on column public.scenes.camera_direction is
  'Agent 5 (Cinematic Director): lens, height and movement for this shot.';

-- --------------------------------------------------------------------------------
-- Project-level output from Agent 3 (Casting Director).
--
-- Stored as jsonb on video_projects rather than in its own table, matching the
-- existing track_states precedent: blueprints are project-scoped, small, and always
-- read as a complete set. Nothing queries an individual character, so a table with
-- its own RLS policies would be cost without benefit.
--
-- Shape: { "<lowercased name>": { name, appearance, wardrobe, demeanor } }
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists character_blueprints jsonb;

comment on column public.video_projects.character_blueprints is
  'Agent 3 (Casting Director): locked visual blueprints keyed by lowercased character name.';
