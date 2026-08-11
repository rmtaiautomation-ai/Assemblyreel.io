-- Run this in your Supabase SQL Editor.
-- Adds 'preset' as an allowed `media.source` value — used for bundled,
-- built-in assets that ship with the app rather than being uploaded or
-- generated (starting with the 6 transition-sound SFX draggable onto A2,
-- see src/lib/transition-music-presets.ts and getOrCreatePresetMedia in
-- src/app/actions/media-actions.ts). Each project gets its own `media` row
-- per preset (media.project_id is a required FK, so there is no shared/global
-- row), lazily created the first time that project uses a given preset —
-- 'preset' distinguishes those rows from 'mock', which means something
-- different (a simulated generation, not a real bundled asset).
-- Safe on an existing database: drops and recreates the check constraint only.

alter table public.media drop constraint if exists media_source_check;

alter table public.media add constraint media_source_check
  check (source in ('upload', 'fal', 'gemini', 'stock', 'stock-fallback', 'mock', 'legacy-unknown', 'preset'));
