-- Run this in your Supabase SQL Editor.
-- Adds 'stock' as an allowed `media.source` value — the source used when a
-- user-approved Pexels/Pixabay pick is downloaded and persisted (see
-- src/app/api/media/from-url/route.ts). Distinct from 'stock-fallback',
-- which is the dev placeholder video set, not a real provider download.
-- Safe on an existing database: drops and recreates the check constraint only.

alter table public.media drop constraint if exists media_source_check;

alter table public.media add constraint media_source_check
  check (source in ('upload', 'fal', 'gemini', 'stock', 'stock-fallback', 'mock', 'legacy-unknown'));
