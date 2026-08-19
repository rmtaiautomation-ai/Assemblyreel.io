-- Per-Act narration for long-form projects
-- (implementation_plans/16-long-form-audio-first-pipeline.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-act-persistence.sql and every other db/add-*.sql in this folder.
--
-- Long-form narration used to be one TTS call over every scene at once, producing a
-- single 25-minute file on video_projects.narration_url. That made three things
-- impossible:
--
--   1. Editing one Act's wording re-recorded the entire video and re-timed every
--      scene, including the ~130 the user never touched.
--   2. The Deepgram alignment walked a single cursor with a +/-5-word search window
--      across ~150 scenes, so one mismatch ("1945" read as "nineteen forty five")
--      silently shifted every later scene with no resync point.
--   3. A synthesis failure at minute 18 of 22 lost all of it.
--
-- Storing narration per Act fixes all three: alignment restarts at each Act boundary,
-- so drift cannot cross one, and re-recording is scoped to a single ~2.5 minute file.

-- --------------------------------------------------------------------------------
-- One row per (project, act). Deliberately a table rather than a jsonb column on
-- video_projects: these rows are written one at a time as each Act finishes, and a
-- jsonb blob would make two concurrent Act writes clobber each other.
-- --------------------------------------------------------------------------------
create table if not exists public.act_narrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  act_number integer not null,

  -- Where the rendered audio for this Act lives. Same shape as scenes.audio_url.
  audio_url text not null,

  -- Measured from the aligned transcript, not estimated from word count. This is what
  -- start_seconds for every later Act is derived from, so it must be the real length.
  duration_seconds numeric not null,

  -- Offset of this Act on the timeline = sum of the durations of all preceding Acts.
  -- Stored rather than recomputed on read so the render payload and the editor cannot
  -- disagree about where an Act starts. Recomputed by recomputeActLayout() whenever
  -- any Act is (re)recorded.
  start_seconds numeric not null default 0,

  -- Deepgram word timings for THIS act only, relative to the start of this act's own
  -- audio file. Kept act-relative on purpose: a later Act shifting does not require
  -- rewriting these, only the start_seconds above.
  -- Shape: [{ "text": "Word", "startMs": 0, "endMs": 240 }, ...]
  word_timings jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One narration per act. Re-recording upserts onto this key rather than appending.
  unique (project_id, act_number)
);

comment on table public.act_narrations is
  'Per-Act narration audio and word timings for long-form projects. Short/mid-form keeps the single video_projects.narration_url.';

create index if not exists act_narrations_project_idx
  on public.act_narrations (project_id, act_number);

-- --------------------------------------------------------------------------------
-- RLS — mirrors the scenes policy: a user reaches an act_narration only through a
-- project in a workspace they own.
-- --------------------------------------------------------------------------------
alter table public.act_narrations enable row level security;

drop policy if exists "act_narrations_owner_all" on public.act_narrations;

create policy "act_narrations_owner_all" on public.act_narrations
  for all
  using (
    exists (
      select 1
      from public.video_projects vp
      join public.workspaces w on w.id = vp.workspace_id
      where vp.id = act_narrations.project_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.video_projects vp
      join public.workspaces w on w.id = vp.workspace_id
      where vp.id = act_narrations.project_id
        and w.user_id = auth.uid()
    )
  );
