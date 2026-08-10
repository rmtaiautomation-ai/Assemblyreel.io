-- Per-scene generation mode + stock media / lip-sync settings
-- (implementation_plans/08-smart-duration-rounding.md and 09-timeline-editor-stock-media.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-scene-transitions.sql and every other db/add-*.sql in this folder.
--
-- RUN THIS BEFORE using the generation-mode UI. `persistSceneFields` batches pending
-- writes into ONE merged updateScene payload per scene, and PostgREST rejects a
-- request naming a nonexistent column WHOLE — so an unmigrated database would fail
-- the entire write (taking unrelated edits like a duration drag down with it), not
-- just the new field.
--
-- Why this migration exists at all: these three fields were previously written from
-- the editor via updateSceneDetails without ever being added to UPDATABLE_FIELDS or
-- to the table. updateScene silently drops unlisted fields, so the mode a user picked
-- for a scene looked like it saved and was gone on the next page load — the same
-- silent-drop bug that already affects overlay_text/overlay_preset/overlay_color.

-- --------------------------------------------------------------------------------
-- How this scene's visual should be produced.
--
-- Values: ai_video | ai_image | stock_media | static_theme | lip_sync
-- Null means "inherit the project default" (video_projects.default_generation_mode).
--
-- Plain text with a comment rather than a CHECK constraint, matching scenes.scene_type
-- and scenes.transition_type: adding a sixth mode should be a code change, not a
-- migration.
-- --------------------------------------------------------------------------------
alter table public.scenes
  add column if not exists generation_mode text,
  add column if not exists stock_search_query text,
  add column if not exists lip_sync_character_url text;

comment on column public.scenes.generation_mode is
  'How this scene sources its visual: ai_video | ai_image | stock_media | static_theme | lip_sync. Null inherits the project default.';
comment on column public.scenes.stock_search_query is
  'Manual stock-media search term for this scene. Falls back to final_video_prompt when empty.';
comment on column public.scenes.lip_sync_character_url is
  'Source character image/video URL driving lip-sync generation for this scene.';

-- --------------------------------------------------------------------------------
-- Project-wide default mode, so "Generate All Visuals" and newly created scenes have
-- something to inherit. Previously React state only, which meant the choice was lost
-- on every page reload and bulk generation would refuse to run until it was re-picked.
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists default_generation_mode text;

comment on column public.video_projects.default_generation_mode is
  'Fallback generation_mode for scenes that have not set their own.';
