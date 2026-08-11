-- Opt-in Ken Burns pan & zoom for image scenes.
-- (implementation_plans/11-ken-burns-image-effect.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-scene-transitions.sql and every other db/add-*.sql in this folder.
--
-- RUN THIS BEFORE the matching UPDATABLE_FIELDS change reaches the app.
-- `persistSceneFields` batches pending writes into ONE merged updateScene payload per
-- scene, and PostgREST rejects a request naming a nonexistent column WHOLE — so a
-- Ken Burns toggle batched with, say, a duration drag would silently take the duration
-- change down with it, leaving only a console.error behind.

-- --------------------------------------------------------------------------------
-- A single on/off flag, deliberately with no companion direction/variant column.
--
-- The motion variant is derived at render time from a hash of the scene's own id, so
-- it is stable across every preview and export without being stored — which means
-- there is nothing to backfill here, and no way for a stored variant to drift out of
-- sync with the variant list in code.
--
-- Meaningful only for image scenes. A scene later switched to video keeps the flag
-- but the renderer ignores it (and the editor hides the control), matching how the
-- other media-type-specific scene fields behave across a switch.
-- --------------------------------------------------------------------------------
alter table public.scenes
  add column if not exists ken_burns_enabled boolean not null default false;

comment on column public.scenes.ken_burns_enabled is
  'Opt-in slow pan/zoom over a static image. Ignored when custom_media_type is video. Motion variant is derived from the scene id at render time, not stored.';
