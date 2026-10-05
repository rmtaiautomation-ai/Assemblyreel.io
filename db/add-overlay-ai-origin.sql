-- Migration to add 'origin' column to overlay_clips table
-- Used to distinguish user-placed overlays from AI-placed ones (so AI runs don't overwrite user edits)

alter table public.overlay_clips
add column if not exists origin text not null default 'user' check (origin in ('user', 'ai'));
