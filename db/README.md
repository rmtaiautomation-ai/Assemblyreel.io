# Database

Every `.sql` file here is run by hand, pasted into the **Supabase SQL Editor**. There is no
migration runner and no `schema_migrations` table — the database's real state lives in Supabase,
and this folder is the reconstructed history of how it got there.

**Filenames are load-bearing.** The app names these files in its own error messages, e.g.
`src/features/channel-settings/server/fact-actions.ts` tells you to "Run `db/add-channel-facts.sql`" when a table is
missing. Do not rename or renumber them without updating those strings.

## Account access quarantine — reviewed drafts, not applied remotely

For Plan 29 Phases 0–2, follow [the setup guide](../docs/security/account-access-phases-0-2-setup.md).
Run `auth/inventory.sql` read-only first; inspect actual grants, exposed schemas, auth triggers,
and take a private backup. In the selected staging project, apply `auth/001-auth-only-containment.sql`
then `auth/002-account-identities-and-leads.sql`. The first quarantines the entire project's
browser access and makes all buckets private; existing content is preserved but the old tool
loses access. The second permits only minimal own-account identity reads and optional private
server lead capture. These are not part of the legacy setup order below. Do not replay older
permissive policies or RLS-disabling files after quarantine. Existing-project containment and
staging acceptance must be recorded separately; neither was applied during local implementation.

## Billing foundation — draft, not applied

The billing files below are outside the legacy run order. Configuration is deferred;
do not paste them into the existing database yet.

- `audit-billing-readiness.sql`: read-only metadata audit, not a migration.
- `add-billing-accounts.sql`: new protected accounts, subscriptions and event records;
  references `auth.users` without modifying legacy `users`/`profiles`.
- `add-billing-usage.sql`: new allowance periods, operations and immutable reservation
  items; requires the accounts migration first.
- `add-billing-usage-functions.sql`: atomic reserve/settle RPCs; apply after usage tables.
- `add-billing-usage-windows.sql`: idempotent window provisioning without resetting usage.
- `add-billing-checkout.sql`: private checkout attempts and customer-binding RPCs.
- `add-billing-webhook-functions.sql`: account sync leases and atomic subscription/window/event
  application; requires all preceding billing files. Unsupported-event receipts are retained.

The migrations intentionally **fail if their tables/functions already exist** and run in
transactions. The legacy section's rerun guidance does not apply to these drafts.
Review staging schema, roles, grants, ownership and retention before applying them.
The billing test suite executes these six migrations only inside an ephemeral PGlite
database. This does not apply them to Supabase or prove existing-schema compatibility
or multi-connection concurrency. See [billing core](../docs/billing/core-implementation.md).

## Historical run order — not the secured account deployment procedure

The order below reconstructs the old personal-tool database. **Do not replay this
section on an account-access environment.** Plan 29's `auth/001`–`006` drafts supersede
its public/disabled-RLS assumptions. The three historical RLS-disabling files now
refuse that operation when account-access quarantine is present. Other old DDL/RPC
files still require review; do not restore their broad grants. Apply and record
new migrations individually after checking the actual schema and private backups.

For Phases 3–6, apply the reviewed continuation after `auth/001`–`002`:
`003-confirmed-email-sync.sql`, `004-owned-records.sql`, `005-private-assets.sql`,
then `006-account-request-limits.sql`. See the [continuation setup guide](../docs/security/account-access-phases-3-6-setup.md).

Phase 7 adds `auth/007-resumable-onboarding.sql` after 001–006. It persists owned setup and atomically creates one metadata draft per account. Review the actual `video_projects.status` column, triggers and constraints before applying it; do not replay historical status cleanup blindly. See the [Phase 7 setup and manual acceptance guide](../docs/security/account-access-phase-7-setup.md).

Phases 8–10 add auth 008–010 after auth 001–007 **and** the six reviewed billing foundation drafts. See [the local setup guide](../docs/security/account-access-phases-8-10-setup.md) for the exact mixed dependency order. These drafts add test-mode personal enrollment, durable private jobs and protected resource allowance configuration. Catalogs remain empty, sales remain disabled, and no migration has been applied to an external project during this continuation. Do not reapply 001 after later grants.
`ownership-audit.sql` is read-only. Existing unknown owners and invalid legacy relationships
remain quarantined; NOT VALID constraints protect new writes while awaiting explicit repairs.
The later drafts are ordered, one-time migrations, not a bulk rerun script.

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
| `fix-media-rls.sql` | **Superseded:** old RLS-disabling repair; never use for secured accounts |
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
| `fix-channel-facts-rls.sql` | **Superseded:** includes historical RLS disabling; never replay for secured accounts |
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
