-- Run this in your Supabase SQL Editor.
-- (implementation_plans/12-overlay-track-kinetic-text.md)
--
-- Creates `overlay_clips` — text overlays as independent timeline clips with
-- their own timing and on-screen position, decoupled from scenes.
--
-- Deliberately NOT reusing `timeline_items`: that table's `media_id` is a
-- required FK because every A1/A2 clip is a real media file. A text overlay is
-- pure config with no media behind it, so forcing a fake `media` row per
-- overlay would be a lie in the data model.
--
-- Distinct from the older per-scene overlay (scenes.overlay_text /
-- overlay_preset / overlay_color), which stays exactly as it is. That one is
-- "one label welded to one scene"; this one is "a clip that lives on its own
-- track and can span, overlap, or sit anywhere". Both render.

create table if not exists public.overlay_clips (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,

  text text not null default '',
  -- Only meaningful for the 'chapter-card' preset (the small label above the
  -- headline). Harmless on every other preset, same way fontSize is optional.
  kicker_text text,

  -- Plain text with a comment rather than a CHECK constraint, matching
  -- scenes.transition_type: adding a ninth preset should be a code change,
  -- not a migration.
  preset text not null default 'cinematic-reveal',
  color text not null default '#FFFFFF',
  font_size numeric,

  -- Position of the overlay's CENTER, as a percentage of frame width/height.
  -- Percentages, not pixels, so one value is correct at 1080x1920, 1920x1080
  -- and 1080x1080 alike — the editor preview and the headless render disagree
  -- on pixel size but never on proportion.
  x_percent numeric not null default 50,
  y_percent numeric not null default 50,

  -- Darkens the footage behind this clip for the length of this clip, so text
  -- stays readable over busy footage. Per-clip, not per-scene.
  dim_background boolean not null default false,

  -- Seconds from the start of the timeline. Seconds rather than frames, so a
  -- 30<->60fps export-quality switch doesn't rescale anything — same
  -- convention as timeline_items.start_time and scenes.video_duration.
  start_time numeric not null default 0,
  duration numeric not null default 3,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists overlay_clips_project_id_idx on public.overlay_clips(project_id);

comment on column public.overlay_clips.x_percent is
  'Horizontal centre of the overlay, 0-100 percent of frame width. Resolution- and aspect-independent.';
comment on column public.overlay_clips.y_percent is
  'Vertical centre of the overlay, 0-100 percent of frame height. Resolution- and aspect-independent.';
comment on column public.overlay_clips.preset is
  'Animation: slide | pop | typewriter | lower-third | cinematic-reveal | line-wipe | letter-collapse | chapter-card.';

-- NOT optional — see db/fix-media-rls.sql for the full story. A table created
-- through the Supabase SQL Editor gets RLS ON with zero policies, which
-- silently denies every read and write from the app's anon key: inserts fail
-- with "new row violates row-level security policy", and any row seeded from
-- the editor's own superuser context is invisible to the app. Every other
-- table this app uses (scenes, video_projects, workspaces, media,
-- timeline_items) runs with RLS disabled under the same no-real-user-auth
-- posture; leaving it on here would break this feature the moment it shipped,
-- in a way that looks like a code bug rather than a database setting.
alter table public.overlay_clips disable row level security;
