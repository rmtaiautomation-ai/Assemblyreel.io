# Documentary template library — Phase 0 readiness

Reviewed on 2026-10-06 (Asia/Manila).

**Status:** Phase 0 local implementation and regression verification complete. This report records the Phase 0 findings; the subsequently authorized Phase 1 implementation and remaining hosted activation checks are recorded in [Phase 1 readiness](phase-1-readiness.md).

## What changed

The existing AI combo writer now uses the same content contract as the manual editor and Remotion renderer:

| Content | Previous AI shape | Correct shape |
|---|---|---|
| Card design | `template_data.style` | `template_data.styleId` |
| Checklist rows | `template_data.items` | `template_data.bullets` |
| Title or quote copy | `template_data.text`, with empty row text | Top-level row `text` |

Title Reveal selects `cutout-hero`; Checklist selects `ledger-classic`; Quote selects `quote-card`. A supplied single checklist point is preserved instead of being replaced with generic example points. Plain-text combos retain their existing presets and displayed text; environmental layers carry no headline.

`src/lib/presentations/legacy.ts` adapts older card data when the editor loads rows and when the composition renders. Its rules are:

- Legacy `style: "default"` maps to the kind's existing default. Other nonempty legacy style strings become `styleId`; unknown styles remain visibly unresolvable.
- Existing canonical keys take precedence, including an intentional empty headline or empty bullet list.
- Nested text is recovered only from a legacy style-tagged card with an empty top-level headline and no canonical style key.
- Checklist `items` becomes `bullets` only when the canonical key is absent and every item is a string.
- Non-card overlays, manual cards without aliases, timing, positions, IDs, and extra metadata retain their current behavior. Inputs are not mutated.
- Loading a project causes no migration writes. An explicit card text/data edit saves the canonical content pair so clearing recovered text stays cleared after reload and a style edit retains recovered text.

The editor also detects Quote using the canonical style ID. This is a correction to the existing combo selector, not a new template browser or Presentation panel.

## Verification evidence

| Check | Result |
|---|---|
| Pre-fix combo regression tests | Three tests reproduced the contract mismatches before the fix. |
| `node --test tests/presentations/*.test.mjs` | 17 passed. Covers real combo action persistence with stubbed I/O, legacy content recovery, empty-content reload, canonical precedence, unknown styles, manual styles, scene timing, and the read-only SQL inventory against isolated PGlite fixtures. |
| `npm run typecheck` | Passed before and after the code changes. |
| Focused lint on new adapter, combo config, presentation scripts/tests | Passed. |
| Actual `MainVideo` local Remotion bundle | Built successfully and rendered with no captured browser errors. |
| Reference stills | 60 before + 60 after captures, at 1920×1080 and 1080×1920 composition sizes; PNG output at half scale. |
| Render comparison | 48 unaffected captures have identical SHA-256 hashes. Only the expected 12 AI/legacy title, quote, and checklist captures changed. |
| Visual inspection | Corrected title, quote, and portrait checklist captures show populated content and intended layouts. |

The 60-case set contains all 12 manual card styles, all eight combos, three legacy card shapes, captions, and all six existing scene transition modes, in both orientations. These are representative sampled frames, not an exhaustive comparison of every animation frame or a production Lambda render. The timing tests additionally cover a 200-scene timeline and short-neighbour transition clamps.

The source tree's existing lint exclusions remain unchanged. Explicit lint of the touched server action still reports its pre-existing `catch (error: any)` diagnostic; this phase does not claim a repository-wide clean lint run. Remotion emitted a non-fatal webpack cache snapshot warning during the after bundle; captures and comparisons succeeded.

Local evidence is under the ignored `out/presentations-phase-0/` directory:

- `before/report.json` and `before/*.png`: unmodified renderer captures.
- `after-verified/report.json` and `after-verified/*.png`: corrected renderer captures and comparison results.
- `after/`: incomplete first after attempt, which exposed a Remotion bundler path-alias issue. The shared adapter now uses relative imports and the successful run is `after-verified`.

These generated files are local verification artifacts; fixture definitions and the runner are kept in source. The runner refuses to overwrite an existing capture directory.

To create another independent capture:

```powershell
node --test tests/presentations/*.test.mjs
npm run typecheck
npx eslint --no-ignore src/lib/presentations/legacy.ts src/lib/combo-templates.ts tests/presentations scripts/presentations
node scripts/presentations/render-baseline.mjs review-current
node scripts/presentations/render-baseline.mjs review-repeat review-current
```

Use new labels for each run. The runner bundles the actual composition and uses authored synthetic media, without copying customer media into the bundle. Google font loading and a Remotion-compatible headless browser are still runtime requirements. No provider generation, remote database writes, or deployment was used for these checks.

## Existing-row inventory

The affected historical shapes are recorded in tests. `db/audit-documentary-overlays.sql` supplies a read-only schema/RLS inventory and lists the exact row IDs that would use the adapter. It handles missing kind/template-data/origin columns through row JSON inspection, while exposing the actual column inventory separately.

**Live row counts and IDs have not been verified.** No explicit staging database was selected for this phase, and a local fixture cannot establish which production rows exist. Before any future migration, run the audit in the selected environment and retain its results. The audit does not include headline or bullet copy in its output and does not repair rows. If the table is absent, stop after the schema query.

## Dependencies and decisions for Phase 1

| Area | Source-backed finding | Required next step |
|---|---|---|
| Project access | `src/proxy.ts` currently bypasses auth for development. The overlay table creation SQL disables RLS; overlay actions and render route do not explicitly verify project ownership. Live RLS state is unverified. | Establish authenticated actor/project ownership and test cross-project denial before exposing presentation writes/export in a hosted SaaS. Ownership must not depend on whether a user has an active paid plan. |
| Billing boundary | The separate Phase 25 work includes billing authorization code; this phase did not alter it or treat it as a completed general project access contract. | Connect paid generation/export through its verified contract when ready; keep template content editing's ownership check independent. |
| Hosted/nested media | Current render preparation and cloud URL rewriting handle scene media and audio, not nested card image URLs. Local synthetic fixtures do not prove uploaded image availability. | Traverse supported template asset slots, reject browser-only URLs, and verify renderer-accessible assets in the selected environment in Phase 1. |
| Local versus Lambda bundle | Local bundles use current source. Lambda uses a separately deployed site URL. | Deploy the verified bundle as part of the appropriate release and confirm preview/export parity. No deployment was performed here. |
| Fonts and language | Current fonts load Latin subsets of Inter, Oswald, Source Serif 4, and JetBrains Mono. | Use the existing Latin-text path for the initial slice. Confirm actual project narration language and approved pilot script; add verified script-specific fonts/shaping before promising Aramaic, Hebrew, or Ge'ez rendering. |
| Pilot assets | Channel briefs exist for Enoch and Mesopotamia, but approved source images, permissions/source links, portrait cutouts, and original-language passages were not supplied or authenticated by this task. | Select real pilot scenes and their approved asset/source set before family-specific acceptance. Synthetic fixtures are labeled test content. |
| Legacy autopilot | `run-autopilot` is defined in `src/trigger/autopilot.ts`; no repository trigger call site was found. The form stores `workflow_mode`, which does not establish that a deployed job runs. External schedules/deployment are unverified. | Keep the worker isolated from the new presentation pipeline. Check the Trigger deployment separately before deciding to retire or replace it. |
| Worker compatibility | That worker uses request-oriented server helpers, reads scene `script`, hardcodes start 0/duration 3 and 16:9 video, and does not apply `anchorPhrase` timing. | Do not wire it into Phase 1; trusted job authorization, scene timing, content fields, and media selection need a reviewed integration. |
| Replacement semantics | Existing combo application deletes supplied clips before creating new ones and can return success after partial inserts. Legacy clips still use absolute times and inferred scene membership. | Implement attached presentations, atomic replacement, version/lock checks, and Undo in Phase 1. The scoped Phase 0 adapter does not resolve those workflows. |

## Gate assessment

The **local compatibility gate passes**: existing sampled templates are preserved, corrected AI cards render populated content, and the regression fixtures and dependency findings are recorded. The hosted release gate remains open for actual row inventory, ownership enforcement, asset/font readiness, and deployed renderer verification.

The next implementation slice is Phase 1's single D03 Image Comparison workflow after review of this report and the module plan. No new family, schema migration, provider call, or cloud deployment was added in Phase 0.
