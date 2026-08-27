-- Fixes two problems with the first run of db/add-channel-facts.sql
-- (implementation_plans/22-channel-fact-ledger.md)
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor. Safe to run more than once.
--
-- ## 1. The ledger was invisible to the app
--
-- add-channel-facts.sql enabled row-level security and copied the owner-scoped policies
-- that database_setup.sql declares for video_projects:
--
--     auth.uid() = (select user_id from public.workspaces where id = workspace_id)
--
-- Those policies are in the setup script but are NOT live on this database — reading
-- `workspaces` and `video_projects` with the anon key returns every row, which it could
-- not do if RLS were enforcing. Meanwhile `workspaces.user_id` is null on the existing
-- rows, so the policy above evaluates to NULL rather than TRUE and denies everything.
--
-- Net effect: channel_facts was the only table in the schema actually enforcing RLS, the
-- rows were written correctly, and the app read zero of them.
--
-- So this matches channel_facts to the rest of the schema rather than leaving one table
-- half-secured. The policies are dropped rather than left in place, because a policy that
-- exists but is not enforced is worse than none: it reads like protection during a review
-- and provides none.
--
-- >> SECURITY NOTE, and it is not a small one. This database currently has no row-level
-- >> protection on ANY table: anyone holding the anon key — which ships to the browser by
-- >> design, as NEXT_PUBLIC_SUPABASE_ANON_KEY — can read and write every workspace, every
-- >> project and now every ledger. That is survivable while this is a single-user local
-- >> project. It must be closed before anyone else has an account. Doing so means
-- >> populating workspaces.user_id and enabling RLS across the whole schema at once, which
-- >> is a larger change than this file should make on its own.

alter table public.channel_facts disable row level security;

drop policy if exists "Users can view own channel facts." on public.channel_facts;
drop policy if exists "Users can insert own channel facts." on public.channel_facts;
drop policy if exists "Users can update own channel facts." on public.channel_facts;
drop policy if exists "Users can delete own channel facts." on public.channel_facts;

-- ## 2. The seed was inserted more than once
--
-- db/seed-enoch-facts.sql is a plain INSERT and the table has no uniqueness constraint on
-- label — deliberately, since two channels may legitimately cite the same scholar. Running
-- it three times produced three copies of all forty rows.
--
-- Keeps the oldest row of each duplicated name per workspace. `ctid` is the physical row
-- identifier, so this picks a single survivor deterministically without depending on
-- created_at, which is identical across rows written by one statement.
delete from public.channel_facts a
using public.channel_facts b
where a.workspace_id = b.workspace_id
  and lower(a.label) = lower(b.label)
  and a.ctid > b.ctid;

-- A unique index rather than a table constraint, and scoped per workspace: it stops a
-- re-run of the seed silently doubling the ledger again, while still allowing two
-- different channels to hold the same source. A second run now fails loudly instead of
-- quietly duplicating.
create unique index if not exists channel_facts_workspace_label_key
  on public.channel_facts (workspace_id, lower(label));

-- What you should see afterwards: 40 total, 30 verified, 3 marked every-episode.
select count(*) as total,
       count(*) filter (where verified) as verified,
       count(*) filter (where always_use) as every_episode
from public.channel_facts
where workspace_id = 'a5fd8195-204d-424a-9c14-99e80e45ea49';
