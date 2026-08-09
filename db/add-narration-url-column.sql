-- Run this in your Supabase SQL Editor.
-- Adds the narration_url column that "Generate Full Narration" writes to.
-- Without it, generated master narration plays back in the current session
-- but silently fails to persist, disappearing after navigating away and back.
-- Safe on an existing database: this only adds a column, it never drops data.

ALTER TABLE public.video_projects
    ADD COLUMN IF NOT EXISTS narration_url TEXT;
