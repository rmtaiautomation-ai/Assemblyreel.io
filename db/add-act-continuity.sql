-- What each Act already said, so the next one can avoid repeating it.
-- (implementation_plans/18-channel-blueprint.md — continuity ledger)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as every
-- other db/add-*.sql in this folder.
--
-- ## The problem this solves
--
-- Long-form generates one Act per request, and no Act can see what any other Act wrote.
-- `structure.arcBeats` already tells each Act which once-only beats belong to OTHER Acts
-- and to leave them alone, but that is a negative instruction against an absent record —
-- Act 7 is told "the suppression beat is Act 8's" while having no idea whether the Council
-- of Laodicea has already been named. Observed across two separate 9-Act videos: the
-- suppression chronology appeared in Act 7 AND Act 8 both times, nearly verbatim.
--
-- A second, stronger cause sat in the NAMED SOURCES block, whose frame section told every
-- Act "these appear in every episode — use them". Written meaning "every video", read by
-- each Act as "use them here". A positive instruction to cite beats a negative instruction
-- not to, so the frame facts recurred Act after Act. That wording is fixed in
-- format-prompt.ts alongside this migration; this column supplies the missing record the
-- negative instruction needed to become checkable.
--
-- ## Why it stores named facts rather than a written summary
--
-- The alternative was an LLM call per Act to summarise what it covered. Rejected: it costs
-- a request against the same quota the generation itself competes for, and it asks a model
-- to self-report, which is exactly the unverifiable-metadata problem
-- db/add-rotation-cursor.sql already documents. The channel fact ledger is a CLOSED set of
-- known strings, so "which facts did this Act name" is answered by matching those strings
-- against the generated narration — deterministic, free, and precisely targeted at the
-- entity repetition actually observed.
--
-- Shape: [{ "actNumber": 1, "title": "...", "namedFacts": ["Council of Laodicea", ...] }]
--
-- jsonb rather than a table because these rows are always read as a complete set, are
-- small and bounded (one entry per Act, at most eleven), and are written by the same
-- single-threaded per-Act path that already owns the project row — none of the concurrent
-- -write pressure that made act_narrations a real table applies here.

alter table public.video_projects
  add column if not exists act_continuity jsonb;

comment on column public.video_projects.act_continuity is
  'Per-Act record of which channel_facts each Act already named, so later Acts can be told not to repeat them. Written after each Act generates; read before the next one. Null on projects predating this column.';
