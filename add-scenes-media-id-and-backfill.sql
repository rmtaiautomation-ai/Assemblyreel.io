-- Run this in your Supabase SQL Editor, AFTER create-media-and-timeline-items.sql.
-- Adds scenes.media_id (supplements, does not replace, custom_media_url/type —
-- the Remotion preview and V1 rendering still read the flat columns directly)
-- and backfills a media row for every existing scene that already has a
-- custom_media_url, so nothing existing is silently orphaned.
-- Safe to re-run: both the insert and the update are guarded.
--
-- NOTE ON THE ::uuid CASTS BELOW: this database's `scenes.project_id` is TEXT
-- (a legacy artifact of supabase-scenes-schema.sql), while `media.project_id`
-- is uuid to match video_projects.id. Postgres won't compare uuid = text, so
-- the cast is required. It's a no-op if the column is already uuid, and every
-- existing scenes.project_id value was verified to be uuid-shaped, so the cast
-- cannot fail on current data.

ALTER TABLE public.scenes
    ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES public.media(id) ON DELETE SET NULL;

INSERT INTO public.media (project_id, media_type, source, status, url, provider_model)
SELECT
  s.project_id::uuid,
  COALESCE(NULLIF(s.custom_media_type, ''), 'video'),
  CASE
    WHEN s.generation_status = 'Simulated' THEN 'stock-fallback'
    WHEN s.ai_model LIKE 'fal-%' THEN 'fal'
    WHEN s.ai_model IN ('gemini-image', 'gemini-veo') THEN 'gemini'
    ELSE 'legacy-unknown'
  END,
  'ready',
  s.custom_media_url,
  s.ai_model
FROM public.scenes s
WHERE s.custom_media_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.media m
    WHERE m.url = s.custom_media_url
      AND m.project_id = s.project_id::uuid
  );

UPDATE public.scenes s
SET media_id = m.id
FROM public.media m
WHERE s.custom_media_url = m.url
  AND s.project_id::uuid = m.project_id
  AND s.media_id IS NULL;
