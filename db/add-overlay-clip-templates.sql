-- Run this in your Supabase SQL Editor.
-- (implementation_plans/13-graphic-card-templates.md)
--
-- Adds designed graphic-card templates as new KINDS of clip on the existing
-- OV track (overlay_clips), rather than a new table or a new timeline track.
--
-- `kind` defaults every existing row to 'text' — today's plain-text overlay
-- behavior — so no backfill is needed and the existing text-overlay render
-- path is untouched.
--
-- `template_data` carries kind-specific fields as JSON rather than adding
-- sparse columns for two very different shapes:
--   checklist-card:    { bullets: string[] }
--   title-cutout-card: { backgroundImageUrl?: string, foregroundImageUrl?: string }
-- Every other overlay_clips column (text, color, preset, x_percent, y_percent,
-- start_time, duration, dim_background) is reused across kinds instead of
-- duplicated — see the field-mapping table in the plan.

alter table public.overlay_clips
  add column if not exists kind text not null default 'text',
  add column if not exists template_data jsonb not null default '{}'::jsonb;

comment on column public.overlay_clips.kind is
  'text | checklist-card | title-cutout-card. Determines which fields in template_data are read.';
