-- The ONE framing device a single video is built around.
-- (implementation_plans/18-channel-blueprint.md, Phase 7 — correction)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as every
-- other db/add-*.sql in this folder.
--
-- ## What this fixes
--
-- `db/add-rotation-cursor.sql` added `workspaces.rotation_cursor` and its own comment
-- described it as "advanced by one on every Act-generation call" — which is exactly what
-- shipped, and exactly the bug. `format-profile.ts` describes the same mechanism as
-- enforcing "non-repetition across PROJECTS", and that is the reading the format actually
-- needs. The two descriptions contradict each other; the per-Act one won by being the one
-- that got implemented.
--
-- Consuming the cursor once per Act means a 9-Act video draws NINE different framing
-- devices from a 7-entry pool: it exhausts the pool, wraps, and repeats — inside a single
-- video. Observed in a real 9-Act generation, where Act 3 was built around "a fragment
-- surviving in only one collection", Act 6 around "a language in which the text stayed
-- canonical", and Act 8 around "a translation that softens or drops a specific phrase".
-- Three different framings of the same suppression, in one video, none of them the
-- video's frame. The device is supposed to be the lens the WHOLE episode is shot through,
-- varying between episodes so a back catalogue doesn't sound like one video on repeat.
--
-- ## Why a column on the project rather than a smarter cursor
--
-- The selected device has to survive across separate requests: long-form generates one
-- Act at a time, with a human approval gate between them, so Act 7 runs in a different
-- request — potentially days later — than Act 1. There is nowhere else to keep it. Storing
-- the resolved device string rather than the cursor index also means a later edit to the
-- channel's pool cannot retroactively change what an already-written video was framed
-- around, which is the same "freeze it onto the project" guarantee that
-- `format_blueprint_snapshot` and the fact ledger already provide.

alter table public.video_projects
  add column if not exists framing_device text;

comment on column public.video_projects.framing_device is
  'The single rotating framing device this video is built around, drawn once from the channel''s pool at first Act generation and reused by every later Act. Null on projects created before this column, and on channels whose format declares no rotatingDevices.';

-- Corrects the description written by db/add-rotation-cursor.sql, which documented the
-- per-Act behaviour this migration exists to replace. The column itself is unchanged —
-- only how often it is advanced.
comment on column public.workspaces.rotation_cursor is
  'Round-robin index into the active FormatProfile''s content.rotatingDevices pool. Advanced ONCE PER VIDEO — on the first Act generated for a project — so consecutive videos cycle the pool while every Act within one video shares that video''s single device (video_projects.framing_device).';
