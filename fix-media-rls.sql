-- Run this in your Supabase SQL Editor.
-- `media` and `timeline_items` were created with Row Level Security ON and no
-- policies (Supabase's default for tables created via the SQL Editor), which
-- silently denies every read/write from the app's anon key. Confirmed live:
-- an anon-key insert failed with "new row violates row-level security policy",
-- and the 7 rows the backfill migration created (via the SQL Editor's
-- superuser context) are invisible to the app for the same reason.
--
-- This matches every other table in this app (scenes, video_projects,
-- workspaces) which already work via the anon key with no real user auth —
-- disabling RLS here keeps media/timeline_items consistent with that same
-- de facto posture rather than silently breaking on tables that happen to
-- have been created differently.

ALTER TABLE public.media DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_items DISABLE ROW LEVEL SECURITY;
