-- Rotation cursor for a channel's framing devices
-- (implementation_plans/18-channel-blueprint.md, Phase 7)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as every
-- other db/add-*.sql in this folder. Separate migration from add-channel-blueprint.sql
-- because that one is already applied on the real database this project uses; a column
-- added by editing an already-run file would never reach it.
--
-- Without this, `content.rotatingDevices` (a FormatProfile's pool of framing devices —
-- "a canon list that omits the text", "a fragment that survives only in one
-- collection", etc.) is shown to the Script Writer as a menu it picks freely from, once
-- per Act-generation call, with each call independent and no memory of earlier ones.
-- Nothing stops every Act across every video in a channel converging on the same one or
-- two devices — the exact failure mode research earlier in this project identified in
-- competing channels that lean on a single repeated "banned by the Council of Laodicea"
-- beat until it reads as the channel's tic rather than a genre device.
--
-- A single integer, not a jsonb ledger of what was used: rotation only needs to answer
-- "which pool index is next", and a round-robin cursor answers that deterministically
-- without relying on the model to accurately self-report which device it picked from an
-- open-ended prompt instruction — which would be unverifiable, since the Script
-- Writer's response is a plain array of narration lines (see schemas.ts) with nowhere
-- to report metadata like that back.

alter table public.workspaces
  add column if not exists rotation_cursor integer not null default 0;

comment on column public.workspaces.rotation_cursor is
  'Round-robin index into the active FormatProfile''s content.rotatingDevices pool. Advanced by one on every Act-generation call that has a non-empty pool, so consecutive Acts — within one video and across a channel''s whole history — cycle the pool rather than each freely re-choosing.';
