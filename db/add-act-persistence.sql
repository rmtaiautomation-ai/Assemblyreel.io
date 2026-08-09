-- Act persistence for the Whiteboard (implementation_plans/04-script-writer-and-generation-ui.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-agent-pipeline-columns.sql and every other db/add-*.sql in this folder.
--
-- Without this, the Whiteboard only exists as React state during one generation
-- session: leaving the page loses which scenes belonged to which act, even though the
-- scenes themselves are safely in the DB. This is what lets a returning visit to
-- /workspaces/[slug]/videos/[videoId]/whiteboard rebuild the act cards, and what a
-- future "regenerate this act only" needs to scope a delete to exactly one act's rows.

-- --------------------------------------------------------------------------------
-- Which act each scene belongs to.
-- Short/mid-form projects are single-pass and get act_number = 1 for every scene, so
-- the Whiteboard always has an act to group by, never a null case to special-case.
-- --------------------------------------------------------------------------------
alter table public.scenes
  add column if not exists act_number integer not null default 1;

comment on column public.scenes.act_number is
  'Which Act this scene belongs to. Always 1 for single-pass (short/mid-form) projects.';

-- --------------------------------------------------------------------------------
-- The Act outline itself (title + description), produced once by generateActOutlines
-- and otherwise thrown away. Needed to redraw act cards without re-asking the AI to
-- re-plan a structure it already committed to.
--
-- jsonb array, matching the character_blueprints precedent: project-scoped, small,
-- always read as a complete set.
--
-- Shape: [{ "actNumber": 1, "title": "...", "description": "..." }, ...]
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists act_outlines jsonb;

comment on column public.video_projects.act_outlines is
  'Act structure from generateActOutlines. Single-pass projects store one synthetic entry.';

-- --------------------------------------------------------------------------------
-- The duration tier chosen at creation (e.g. "Short (< 60s)", "Long (10-15m)").
--
-- Nothing previously persisted this — createAndGenerateVideo read it from the form
-- and then discarded it. Resuming the Whiteboard, or regenerating a single Act later,
-- needs it to re-derive the same pacing/word-count rules from generation-rules.ts;
-- without it a resumed session would have no way to know which tier's rules applied.
-- --------------------------------------------------------------------------------
alter table public.video_projects
  add column if not exists target_duration text;

comment on column public.video_projects.target_duration is
  'The target_duration form value this project was generated with. Key into src/lib/ai/generation-rules.ts.';
