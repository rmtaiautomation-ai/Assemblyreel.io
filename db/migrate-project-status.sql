-- Run this in your Supabase SQL Editor.
--
-- Normalises video_projects.status onto the current vocabulary:
--   pending | drafting | rendering | exported | failed   (all lowercase)
--
-- Three separate sources of drift are cleaned up here:
--
--   1. database_setup.sql declares `status text default 'Drafting'` — capitalised,
--      with a comment listing "Drafting, Done, Scheduled". The application code has
--      always written lowercase values, so both cases can exist in the same column.
--   2. 'completed' was renamed to 'exported'.
--   3. 'rendering' had no failure path, so an errored render stranded the row there.
--
-- Rows holding an unrecognised status match no branch in the workspace hub UI: they
-- fall through to the draft styling while printing their raw DB value as the badge.

BEGIN;

-- 0. Case-normalise first, so the value-level rules below only deal with lowercase.
UPDATE public.video_projects
SET status = lower(status)
WHERE status IS NOT NULL
  AND status <> lower(status);

-- 1. Legacy 'completed' -> 'drafting'.
--
--    NOTE: 'completed' is being mapped to 'drafting', NOT 'exported'. In this
--    codebase 'completed' was written by createAndGenerateVideo when the *script*
--    finished generating — nothing to do with rendering. The only code that ever
--    meant "render finished" was the FFmpeg route, which has since been deleted,
--    and there is no column recording a rendered artifact to distinguish the two.
--    'drafting' is also the safe direction: it is recoverable by rendering, whereas
--    wrongly marking a project 'exported' would hide unfinished work.
UPDATE public.video_projects
SET status = 'drafting'
WHERE status = 'completed';

-- 2. 'pending' is meant to be transient, held only while the script generates.
--    Anything that already has a script is really a draft.
UPDATE public.video_projects
SET status = 'drafting'
WHERE status = 'pending'
  AND master_script IS NOT NULL
  AND master_script <> '';

-- 3. Any row still 'rendering' is orphaned. There is no job queue yet, so no
--    process exists that could ever finish it; before the lifecycle fix an errored
--    render left the row here permanently, with no way back from the UI.
UPDATE public.video_projects
SET status = 'failed'
WHERE status = 'rendering';

-- 4. Catch-all for legacy values from the original schema comment ('done',
--    'scheduled') and anything else unrecognised, so no row renders with a raw
--    DB string as its badge label.
UPDATE public.video_projects
SET status = 'drafting'
WHERE status IS NULL
   OR status NOT IN ('pending', 'drafting', 'rendering', 'exported', 'failed');

-- 5. Align the column default with the lowercase vocabulary the code writes.
ALTER TABLE public.video_projects
ALTER COLUMN status SET DEFAULT 'drafting';

COMMIT;

-- Verify the resulting distribution — every row should be one of the five values:
--   SELECT status, count(*) FROM public.video_projects GROUP BY status ORDER BY 2 DESC;
