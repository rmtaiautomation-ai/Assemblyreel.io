-- Auto-captions (implementation_plans/01-auto-captions.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-scene-transitions.sql and every other db/add-*.sql in this folder.

-- --------------------------------------------------------------------------------
-- Word-level narration timings, as returned by Deepgram during narration generation.
--
-- These were ALREADY being computed on every narration run and then thrown away:
-- `generateFullNarration` used the word list only to find where one scene's narration
-- ends and the next begins, then dropped it. Persisting it is what makes CapCut-style
-- word-by-word captions possible without a second transcription pass or a second API
-- bill — the expensive part already happened.
--
-- Stored in a minimal, provider-neutral shape rather than Deepgram's raw response, so
-- swapping transcription providers later only changes the writer:
--   [{ "text": "Three", "startMs": 0, "endMs": 240 }, ...]
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists narration_words jsonb;

comment on column public.video_projects.narration_words is
  'Word-level narration timings from Deepgram: [{text, startMs, endMs}]. Drives auto-captions.';

-- --------------------------------------------------------------------------------
-- Whether captions are burned into the preview and the export.
--
-- Defaults to FALSE deliberately: captions change what every existing project's
-- exported video looks like, and a setting that silently turns itself on would
-- rewrite the output of work the user already considered finished.
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists captions_enabled boolean not null default false;

comment on column public.video_projects.captions_enabled is
  'Global auto-captions toggle for this project. Off by default.';
