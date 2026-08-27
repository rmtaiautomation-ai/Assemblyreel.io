-- Fixes act_narrations RLS to match every other table in this schema.
--
-- MANUAL RUN REQUIRED — paste into the Supabase SQL editor.
--
-- add-act-narration.sql gave this table a strict "must be the workspace owner"
-- policy (workspaces.user_id = auth.uid()). Nothing else in this schema enforces
-- that: scenes, video_projects and workspaces are all readable/writable with no
-- session at all, because this app isn't running with real per-user Supabase Auth
-- wired up yet (0 rows in auth.users, every workspaces.user_id is null). Since
-- auth.uid() is always null with no session, and null never equals null in SQL,
-- the owner check could never pass for anyone — every act_narrations insert failed
-- with "new row violates row-level security policy", regardless of how the record
-- action was triggered.
--
-- This makes act_narrations permissive like the rest of the schema currently is.
-- NOTE: if/when this project adds real multi-user auth, every table here —
-- not just this one — will need real ownership policies before this is a
-- production-safe SaaS. Tracked as a known gap, not fixed here.

drop policy if exists "act_narrations_owner_all" on public.act_narrations;

create policy "act_narrations_allow_all" on public.act_narrations
  for all
  using (true)
  with check (true);
