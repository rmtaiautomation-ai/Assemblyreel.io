-- Run this in your Supabase SQL Editor to recreate the scenes table with the correct columns

DROP TABLE IF EXISTS public.scenes CASCADE;

CREATE TABLE public.scenes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL, -- Or UUID if your video_projects uses UUID
    sequence_number INTEGER NOT NULL,
    voice_over_beat TEXT NOT NULL,
    final_video_prompt TEXT NOT NULL,
    video_duration NUMERIC DEFAULT 5,
    custom_media_type TEXT DEFAULT 'video', -- 'video' or 'image'
    custom_media_url TEXT,
    audio_url TEXT,
    generation_status TEXT DEFAULT 'Pending',
    trim_start NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optional: If you already have a video_projects table, you can add a foreign key constraint:
-- ALTER TABLE public.scenes ADD CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES public.video_projects(id) ON DELETE CASCADE;

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
