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

-- Historical personal-tool repair only. Plan 29 supersedes this posture.
do $$ begin
  if exists(select 1 from pg_policies where schemaname='storage' and policyname='auth_only_quarantine') then
    raise exception 'SUPERSEDED_BY_ACCOUNT_ACCESS_MIGRATIONS';
  end if;
  alter table public.media disable row level security;
  alter table public.timeline_items disable row level security;
end $$;
