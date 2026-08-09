-- Run this in your Supabase SQL Editor.
-- Creates `media` (one row per durable media object — an upload or an AI
-- generation, whether it's still in progress or finished) and `timeline_items`
-- (A1/A2 dragged-in clips, always referencing a media row instead of holding
-- their own URL). Safe on an existing database: additive only, no drops.
-- Run add-scenes-media-id-and-backfill.sql AFTER this one — it depends on
-- the `media` table existing.

create table if not exists public.media (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,
  media_type text not null check (media_type in ('video', 'image', 'audio')),
  source text not null check (source in ('upload', 'fal', 'gemini', 'stock-fallback', 'mock', 'legacy-unknown')),
  status text not null default 'ready' check (status in ('uploading', 'generating', 'ready', 'failed')),
  storage_path text,   -- relative path under public/ (e.g. 'media/{projectId}/{mediaId}.mp4') for local files; null for externally-hosted media (Fal CDN, stock fallback)
  url text,            -- always the playable URL: '/media/...' for local files, or the provider's own URL when storage_path is null
  original_filename text,
  duration_seconds numeric,
  provider_model text,
  provider_metadata jsonb default '{}'::jsonb,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists media_project_id_idx on public.media(project_id);

create table if not exists public.timeline_items (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,
  media_id uuid references public.media(id) on delete cascade not null,
  track_id text not null check (track_id in ('A1', 'A2')),
  start_time numeric not null default 0,
  duration numeric not null,
  trim_start numeric not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists timeline_items_project_id_idx on public.timeline_items(project_id);
