-- Run this in your Supabase SQL Editor.
-- Adds the track_states column to video_projects to persist volume and mute states.

ALTER TABLE public.video_projects
ADD COLUMN IF NOT EXISTS track_states JSONB DEFAULT '{"V1":{"locked":false,"muted":false,"volume":1.0},"A1":{"locked":false,"muted":false,"volume":1.0},"A2":{"locked":false,"muted":false,"volume":1.0}}'::jsonb;
