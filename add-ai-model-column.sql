-- Run this in your Supabase SQL Editor.
-- Adds the ai_model column the Timeline Editor's Scene panel writes to.
-- Safe on an existing database: this only adds a column, it never drops data.
-- (Do NOT run supabase-scenes-schema.sql for this — that file starts with DROP TABLE.)

ALTER TABLE public.scenes
    ADD COLUMN IF NOT EXISTS ai_model TEXT;
