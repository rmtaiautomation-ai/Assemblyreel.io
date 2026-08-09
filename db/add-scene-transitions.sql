-- Scene-to-scene transitions for the Timeline Editor.
-- (implementation_plans/05-timeline-scene-management.md, Phase 3)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-act-persistence.sql and every other db/add-*.sql in this folder.
--
-- RUN THIS BEFORE the matching UPDATABLE_FIELDS change reaches the app.
-- `persistSceneFields` batches pending writes into ONE merged updateScene payload per
-- scene, and PostgREST rejects a request naming a nonexistent column WHOLE — so a
-- transition edit batched with, say, a duration drag would silently take the duration
-- change down with it, leaving only a console.error behind.

-- --------------------------------------------------------------------------------
-- The transition INTO this scene, i.e. between the previous scene and this one.
--
-- "Transition in" rather than "transition out" on purpose:
--   * deleting a scene takes its transition with it, leaving no orphan pointing at a
--     scene that no longer exists;
--   * the first scene is a natural null case rather than a special case;
--   * because later scenes paint on top of earlier ones, the animation must be applied
--     to the incoming scene's own subtree — storing the field on that same scene means
--     zero index arithmetic at render time.
--
-- Always ignored for the first scene. That is enforced at layout time rather than
-- stored, so reordering scenes can never strand a value that is now illegal.
--
-- Plain text with a comment rather than a CHECK constraint, matching scenes.scene_type:
-- adding a sixth transition preset should be a code change, not a migration.
-- --------------------------------------------------------------------------------
alter table public.scenes
  add column if not exists transition_type text not null default 'none',
  add column if not exists transition_duration numeric not null default 0.5;

comment on column public.scenes.transition_type is
  'Transition INTO this scene: none | crossfade | slide | zoom | glitch | light-leak. Ignored for the first scene.';

-- Seconds, not frames — consistent with video_duration and trim_start, and it survives
-- a 30<->60fps export-quality switch without rescaling. Stored as the user INTENT and
-- clamped against neighbour scene lengths at render time, never clamped on write: the
-- legal maximum changes whenever an adjacent scene is resized, so a value clamped on
-- write would silently go stale with no event to recompute it.
comment on column public.scenes.transition_duration is
  'Requested transition length in SECONDS. Clamped against neighbour durations at render time.';
