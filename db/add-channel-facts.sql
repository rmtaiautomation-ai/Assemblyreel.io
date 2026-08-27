-- Channel Fact Ledger — the named sources a channel is allowed to cite
-- (implementation_plans/22-channel-fact-ledger.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor, same convention as
-- add-channel-blueprint.sql and every other db/add-*.sql in this folder. A separate
-- file from add-channel-blueprint.sql for the reason that file already documents: it
-- is applied on the real database, and a column added by editing an already-run file
-- would never reach it.
--
-- ## Why this table exists
--
-- The documentary format this project targets names a real scholar, council, manuscript
-- or date every fifteen to twenty seconds — that cadence IS its credibility. But the
-- Script Writer is handed a topic, an outline and a persona, and nothing else. When it
-- reaches a beat that requires a named source it has none to reach for, so it invents
-- one: a real scholar attached to a paper they never wrote, a fragment number that does
-- not exist. That is structural, not a prompt-quality problem. The format opens a slot
-- every few sentences and a language model fills every slot it is given.
--
-- Research across three episodes of the reference channel found the fix is cheap: the
-- STORY changed completely between episodes while the NAMED SOURCES barely changed at
-- all. The same councils, translators and manuscripts recur essentially verbatim. The
-- citation frame is fixed channel-level data; only the payload is per-episode. So a
-- channel needs one list of real items, written once, drawn from forever.
--
-- Workspace-scoped rather than global for the same reason the blueprint is: running a
-- second channel in a different niche must stay a data change, not a code fork.

-- --------------------------------------------------------------------------------
-- The ledger itself. One row per citable item.
-- --------------------------------------------------------------------------------
create table if not exists public.channel_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- What KIND of slot this fact can fill. The Script Writer is not choosing freely: a
  -- beat like "name who removed it, and when" needs a council, and "the standard
  -- scholarly reference is" needs a person. Typing the rows is what lets the compiled
  -- prompt group them so the model reaches for the right kind.
  kind text not null check (kind in (
    'person', 'institution', 'council', 'manuscript', 'publication', 'artifact', 'event'
  )),

  -- The short name, as it would be spoken: "George Nickelsburg".
  label text not null,
  -- The citable form: "2001 commentary on 1 Enoch, Fortress Press".
  detail text not null default '',

  -- The fixed opening frame. A handful of items recur in EVERY episode of a channel
  -- like this (the monastery, the council, the year of the find); the rest are drawn on
  -- only when a beat calls for them. Without this distinction the writer treats a
  -- forty-item list as a menu and the channel's signature opening stops being fixed.
  always_use boolean not null default false,

  -- THE GATE. Nothing reaches a prompt until a human has ticked it.
  --
  -- Rows are written by an extraction agent reading the user's own research paste, and
  -- that source material mixes independently checkable anchors (a council, a published
  -- commentary) with items that are unfalsifiable by construction (a tablet with no
  -- accession number, a monograph circulated privately and never published). Both get
  -- extracted, because the agent cannot reliably tell them apart and guessing silently
  -- is worse than not guessing. Defaulting to false is what stops the second kind
  -- propagating unnoticed into forty videos.
  verified boolean not null default false,

  -- Where it came from, for the person doing the verifying. Free text on purpose.
  source_note text not null default '',

  -- Advanced when a fact is compiled into a script. Not used for any decision today;
  -- it is here so "this channel has leaned on Laodicea in nineteen straight videos"
  -- is answerable later without a schema change.
  times_used integer not null default 0,

  created_at timestamptz not null default now()
);

-- The only query this table serves during generation: every verified fact for one
-- workspace. Partial on `verified` because unverified rows are never read by the
-- pipeline, only by the settings screen, which is not hot.
create index if not exists channel_facts_workspace_verified_idx
  on public.channel_facts (workspace_id)
  where verified;

-- The settings screen reads every row for a workspace, verified or not.
create index if not exists channel_facts_workspace_idx
  on public.channel_facts (workspace_id);

comment on table public.channel_facts is
  'Per-channel allowlist of real, citable named sources. The Script Writer may name ONLY what is listed here and verified; anything else must be stated generally with no name attached.';

comment on column public.channel_facts.verified is
  'Human-checked. Unverified rows are never compiled into a prompt — see the extraction agent in src/lib/ai/agents/fact-archivist.ts, which writes every candidate as false.';

-- --------------------------------------------------------------------------------
-- Stops a re-run of db/seed-enoch-facts.sql, or a second analyst pass over a revised
-- brief, silently doubling the ledger. Scoped per workspace, because two channels may
-- legitimately cite the same scholar. `addExtractedFacts` de-duplicates in application
-- code as well; this is the backstop for the SQL seeds, which do not.
-- --------------------------------------------------------------------------------
create unique index if not exists channel_facts_workspace_label_key
  on public.channel_facts (workspace_id, lower(label));

-- --------------------------------------------------------------------------------
-- RLS: deliberately NOT enabled, to match every other table on this database.
--
-- The first version of this file enabled it and copied the owner-scoped policies that
-- database_setup.sql declares for video_projects. That broke the feature outright: those
-- policies are in the setup script but are not live here — the anon key reads `workspaces`
-- and `video_projects` in full, which it could not do under enforcement — and
-- `workspaces.user_id` is null on the existing rows, so
--
--     auth.uid() = (select user_id from public.workspaces where id = workspace_id)
--
-- evaluates to NULL rather than TRUE and denies every row. channel_facts became the only
-- table actually enforcing RLS, and the settings tab read zero rows from a populated table.
--
-- Declaring policies here that the rest of the schema does not honour would be worse than
-- declaring none: it reads like protection during a review and provides none.
--
-- >> SECURITY NOTE. This database has no row-level protection on any table, so anyone
-- >> holding the anon key — which ships to the browser by design — can read and write every
-- >> workspace, project and ledger. Survivable for a single-user local project; it must be
-- >> closed before a second account exists. That means populating workspaces.user_id and
-- >> enabling RLS across the whole schema together, not one table at a time.
-- --------------------------------------------------------------------------------

-- --------------------------------------------------------------------------------
-- Project = one video. Freezes the ledger that produced it.
-- --------------------------------------------------------------------------------
alter table public.video_projects
  -- The resolved list of VERIFIED facts at the moment generation started, not a
  -- foreign key. Same argument as format_blueprint_snapshot beside it: long-form
  -- generates Act by Act behind a human approval gate, so a ledger read live would let
  -- a fact ticked (or unticked) after Act 3 was approved silently change what Act 7 is
  -- allowed to say. A video must be able to answer "what was I permitted to cite" long
  -- after the channel's ledger has moved on.
  add column if not exists channel_facts_snapshot jsonb;

comment on column public.video_projects.channel_facts_snapshot is
  'Frozen array of the verified channel_facts rows in force when this project began generating. Every agent reads this, never the live workspace ledger.';
