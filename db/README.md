# Database

Every `.sql` file here is run by hand, pasted into the **Supabase SQL Editor**. There is no
migration runner and no `schema_migrations` table — the database's real state lives in Supabase,
and this folder is the reconstructed history of how it got there.

**Filenames are load-bearing.** The app names these files in its own error messages, e.g.
`src/app/actions/fact-actions.ts` tells you to "Run `db/add-channel-facts.sql`" when a table is
missing. Do not rename or renumber them without updating those strings.

## Run order

Ordered by dependency, not by date — see [Ordering traps](#ordering-traps) below for the two
places where the file timestamps lie. Every script is idempotent (`IF NOT EXISTS` / `ON CONFLICT`),
so re-running one is safe.

### 1. Base schema

| File | What it creates |
|---|---|
| `database_setup.sql` | UUID extension, `users`, `workspaces`, `video_projects` |
| `supabase-scenes-schema.sql` | `scenes` |
| `stripe-schema.sql` | Stripe billing columns on `profiles` |

### 2. Media & timeline

Order matters inside this block.

| File | What it does |
|---|---|
| `create-media-and-timeline-items.sql` | `media` + `timeline_items` |
| `add-scenes-media-id-and-backfill.sql` | `scenes.media_id` — **requires the file above** |
| `fix-media-rls.sql` | Adds the missing RLS policies both tables shipped without |
| `add-stock-media-source.sql` | Allows `media.source = 'stock'` |
| `add-preset-media-source.sql` | Allows `media.source = 'preset'` |

### 3. Project & scene columns

| File | Plan |
|---|---|
| `add-ai-model-column.sql` | — |
| `add-narration-url-column.sql` | — |
| `add-track-states-column.sql` | — |
| `migrate-project-status.sql` | — |
| `repair-scene-sequence-numbers.sql` | Repair job for duplicate `sequence_number` |
| `add-agent-pipeline-columns.sql` | `03-native-agent-orchestration.md` |
| `add-act-persistence.sql` | `04-script-writer-and-generation-ui.md` |
| `add-scene-transitions.sql` | `05-timeline-scene-management.md` |
| `add-caption-columns.sql` | `01-auto-captions.md` |
| `add-generation-mode-columns.sql` | `08-smart-duration-rounding.md`, `09-timeline-editor-stock-media.md` |
| `add-scene-ken-burns.sql` | `11-ken-burns-image-effect.md` |

### 4. Overlays

| File | Plan |
|---|---|
| `create-overlay-clips.sql` | `12-overlay-track-kinetic-text.md` |
| `add-overlay-clip-templates.sql` | `13-graphic-card-templates.md` |

### 5. Long-form audio-first pipeline

| File | Plan |
|---|---|
| `add-act-narration.sql` | `16-long-form-audio-first-pipeline.md` |
| `fix-act-narrations-rls.sql` | Brings `act_narrations` RLS in line with every other table |
| `add-act-continuity.sql` | `18-channel-blueprint.md` — continuity ledger |

### 6. Channel blueprint & format

| File | Plan |
|---|---|
| `add-channel-blueprint.sql` | `18-channel-blueprint.md` |
| `add-rotation-cursor.sql` | `18-channel-blueprint.md` Phase 7 |
| `add-project-framing-device.sql` | `18-channel-blueprint.md` Phase 7 correction |

### 7. Fact ledger

Order matters inside this block.

| File | Plan |
|---|---|
| `add-channel-facts.sql` | `22-channel-fact-ledger.md` — creates the tables |
| `fix-channel-facts-rls.sql` | Fixes two bugs in the first run of the file above |
| `seed-enoch-facts.sql` | Seed rows — **requires both files above** |

### 8. Thumbnails

| File | What it does |
|---|---|
| `add-thumbnails.sql` | Per-project thumbnail candidates, on-brand via the channel's `FormatProfile` |

## Ordering traps

Two files carry timestamps that contradict their real dependencies. Sorting this folder by date
and running it top to bottom will fail on both:

- **`seed-enoch-facts.sql`** is dated eight minutes *before* `add-channel-facts.sql`, the script
  that creates the tables it inserts into.
- **`add-scenes-media-id-and-backfill.sql`** is dated four days *before*
  `create-media-and-timeline-items.sql`, even though its own header says to run it afterwards.

## `backups/`

Point-in-time JSON exports of data that is expensive to regenerate — not schema, never run as SQL.
`backup-enoch-blueprint-v11.json` is the Enoch workspace's Channel Blueprint, saved before
`scripts/upgrade-channel-format.mjs` rewrote it onto the beat-sheet spine.
