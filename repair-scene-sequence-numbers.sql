-- Run this in your Supabase SQL Editor.
-- Repairs duplicate sequence_number values caused by inserting/reordering scenes
-- before those operations persisted the renumbering of their siblings (project
-- 620eb618 currently has four scenes all numbered 1, which makes
-- ORDER BY sequence_number return them in an arbitrary order — scenes appear to
-- jump position after a reload).
--
-- Renumbers every project's scenes to a gapless 1..N, breaking ties on
-- created_at so the result is deterministic and stable. Existing correct
-- projects are unaffected (they already sort to the same order).
-- Safe to re-run.

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY sequence_number, created_at, id
    ) AS new_seq
  FROM public.scenes
)
UPDATE public.scenes s
SET sequence_number = o.new_seq
FROM ordered o
WHERE s.id = o.id
  AND s.sequence_number IS DISTINCT FROM o.new_seq;
