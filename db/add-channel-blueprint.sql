-- Channel Blueprint — per-workspace format spec for the generation pipeline
-- (implementation_plans/18-channel-blueprint.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-act-narration.sql and every other db/add-*.sql in this folder.
--
-- Until now the "format" of a channel lived in two places, neither of them data:
--
--   1. src/lib/ai/generation-rules.ts guessed a tone profile from a substring of the
--      free-text workspace theme ("bible" -> mythology -> "Epic, NLT Bible style"),
--      so a channel could not choose its own register.
--   2. src/lib/ai/elevenlabs.ts hardcoded stability/similarity_boost, so every video
--      in every workspace was synthesised with identical voice settings.
--
-- Neither could be edited without a deploy, and running a second channel in a
-- different niche meant forking the code. These columns move the whole format spec
-- into per-workspace data.

-- --------------------------------------------------------------------------------
-- Workspace = channel. Holds the blueprint the user edits.
-- --------------------------------------------------------------------------------
alter table public.workspaces
  -- Which built-in preset this channel started from. Presets live in code
  -- (src/lib/ai/format-profile.ts) so a new workspace is never blank.
  add column if not exists format_preset_key text not null default 'general',

  -- ONLY the fields the user changed away from the preset, as a deep-partial object.
  -- Storing the diff rather than the whole profile means improvements to a preset
  -- reach existing channels, and the settings UI can show "modified from preset"
  -- per field. NULL = pristine preset.
  add column if not exists format_blueprint jsonb,

  -- Bumped on every save. Stamped onto each project so a video's format is
  -- identifiable after the channel format moves on.
  add column if not exists format_blueprint_version integer not null default 1;

comment on column public.workspaces.format_blueprint is
  'Deep-partial override of the built-in format preset named by format_preset_key. NULL means the preset is used unmodified.';

-- --------------------------------------------------------------------------------
-- Project = one video. Holds a frozen copy of the format that produced it.
-- --------------------------------------------------------------------------------
alter table public.video_projects
  -- The FULLY RESOLVED profile (preset + override), not the diff. Deliberately a
  -- snapshot rather than a foreign key to the workspace:
  --
  --   * Long-form generates Act by Act with a human approval gate between each. If
  --     agents read the live workspace row, editing the blueprint after approving
  --     Act 1 would silently change the rules Act 7 is written under.
  --   * It makes a video reproducible after the channel format changes, with no join.
  --   * When a video outperforms, the exact format that produced it is on the row.
  add column if not exists format_blueprint_snapshot jsonb,

  add column if not exists format_blueprint_version integer;

comment on column public.video_projects.format_blueprint_snapshot is
  'Frozen, fully-resolved FormatProfile used to generate this project. Every agent reads this, never the live workspace blueprint.';

-- --------------------------------------------------------------------------------
-- RLS: no new policies needed. Both tables already carry owner-scoped policies
-- (see database_setup.sql) which apply to every column, added ones included.
-- --------------------------------------------------------------------------------
