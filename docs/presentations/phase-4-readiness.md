# Documentary presentation library — Phase 4 readiness

**Reviewed:** 2026-10-08 (Asia/Manila)

**Status:** Phase 4 is implemented and locally/isolated-tested. The library now has fourteen documentary families plus explicit Clean. Remote database activation, real authenticated creator workflows, deployed v3 rendering, approved Enoch/Mesopotamia pilot sources and live AI suitability review remain open. No paid model call, remote migration, cloud deployment, billing activation or Phase 5 work was performed.

This extends [Phase 3](phase-3-readiness.md) and [plan 26](../../implementation_plans/26-documentary-scene-template-library.md). Phases 0–3's first-release gates remain relevant; four new layouts do not resolve their external dependencies.

## Built templates and editorial boundaries

| Family | Content and controls | Honest fallback / limitation |
|---|---|---|
| D11 Cause and Effect — `cause-effect` | Two to four ordered steps, step detail/reveal times, one typed link per adjacent pair, link label, supporting explanation and source. Landscape uses a row, portrait a stack; three/four-step square uses a numbered snake grid. | Sequential is the default and explicitly does **not** establish cause. Causal links require supplied support and a historical-classified source. The creator must still assess causality: a source classification is not independent verification. Change the link meaning explicitly, never an automatic AI downgrade that changes the author's claim. |
| D12 Scale Comparison — `scale-comparison` | Two or three positive linear measurements, height/length, supported units (`mm`, `cm`, `m`, `km`, `in`, `ft`), reference item and per-item approximate flag/source. Metre conversion determines guide dimensions on a common baseline. | Below 6% of the largest measurement, proportional layout is rejected rather than exaggerating the smaller object. Explicit **values-only** keeps the supplied numbers and displays **NOT TO SCALE**. Guides are neutral measurement blocks, not generated silhouettes or physical reconstructions. Area, volume, mass and historical unit inference are not supported. |
| D13 Fact Reveal — `fact-reveal` | One exact supplied display, quantity/date/range kind, unit/convention, qualifier, context, source and reveal cue. | Restrained reveal, not a counter. Dates never animate from zero; ranges and uncertainty remain supplied text. This does not parse, fact-check or normalize arbitrary dates/numbers. |
| D14 Claim and Evidence — `claim-evidence` | Claim, exact supplied passage or owned object image, specific attribution, support/context scope, interpretation, required limits and reveal time. Uses the existing source-image and theme/text primitives. | Object evidence requires an image. Attributed explanation is **context-only**, without a direct-evidence image. Changing kind retains supplied text for review; the creator explicitly removes an unsuitable image. No AI-confidence meter or automatic “verified” stamp. |

Every new family requires a specific source credit to Apply. Source packets additionally require the existing explicit approval and source classification. Direct manuscript transcription, automatic translation, generated diagrams/assets, OCR, icon procurement and new paid services are not added.

D14's passage is supplied explanatory/translated text, not a replacement for D09's script-specific typography. Use the manuscript-image or original-text/translation family when specialized original-script rendering is required.

## UI and workflow

- D11–D14 have distinct schematic posters, purpose-search descriptions, family-specific Content controls, Sources slots, Style, Timing and the existing paused Player preview.
- The same inspector/editor is reused by Scene Board, Timeline and source/suggestion review; no separate inconsistent editor is introduced.
- Source credits/classifications, measurement references, exact values, uncertainty and explanatory limits remain editable.
- Incomplete copy, unavailable owned images, unsupported units, invalid links/references/cues, inadequate hold time and unsafe rendered text block readiness. A bad preview blocks Apply; it is not silently shrunk to fit.
- Safe-margin/caption layout applies to landscape, portrait and square. New bounded panels opt into vertical-overflow checks; existing family checks are preserved.
- Manual Apply/Undo, per-family draft preservation, locks, revision conflicts and explicit AI review/replacement rules continue through existing services.
- New default configurations offer fourteen families. **Existing saved channel settings, project overrides and frozen snapshots keep their original allowed-family arrays.** Enable D11–D14 in Channel Visuals for newly created videos, or Project Visuals for an existing video. Saving settings does not restyle saved scenes.
- Source and AI preview approval do not purchase media or initiate paid generation.

## AI and budget integration

The existing director's allowed candidate family list expands from the shared registry. These four families become eligible only when enabled by the project's settings and backed by reviewed typed source packets. Their validated content is copied unchanged; the model still returns selection IDs, reason, alternatives and exact cue occurrences, not invented measurements, causal support, quotes or archaeological conclusions.

Missing packets remain non-ready repair candidates. An unreadable proportion cannot become ready just because AI selects it. The creator may prepare/approve an explicit values-only packet or review/edit a proposed draft. Exact narration alignment, pacing, manual/locked scene scope, stale input protection, per-scene outcomes and stable request/apply IDs are inherited unchanged.

The provider/model, billing ledger, token-cap accounting and activation flags are unchanged. Paid requests remain off by default and require the approved billing catalog/policy. The Phase 3 cap-based settlement and interruption/reconciliation release checks still apply. This phase does not claim that real AI selections have passed a human suitability evaluation.

## Compatibility and database activation

The new additive migration is **`db/add-documentary-phase-4.sql`**, after the Phase 1, Phase 2 and Phase 3 migrations. It was applied twice in isolated PGlite, **not remotely**.

- Existing CAS/manual and reviewed-AI RPCs remain in place, including ownership checks, origin tracking, lock protection and retries.
- The owned image-slot validator delegates earlier families to its retained private Phase 2 implementation and validates the four new families. D14 nested images traverse the same owned-media lookup and export preparation.
- The Visuals RPC expands its allowlist/maximum to fourteen without updating any saved preferences.
- The snapshot registry revision becomes `2`, changing the input hash and rejecting pre-expansion suggestions. Private legacy helpers cannot be called directly by authenticated users.
- New/mixed projects containing D11–D14 select **`MainVideo-Documentary-v3`**. Legacy, v1 and v2 composition IDs remain registered. An old remote bundle lacks v3 and must fail rather than omit a new family silently.
- Apply ordered migrations through Phase 4. Rerunning an earlier migration alone can replace a newer wrapper/function: do not treat isolated old SQL reruns as a safe upgrade or rollback.
- Roll back by disabling generation/new-family availability and retaining compatible readers/renderers. Do not delete source packets, existing presentations or retained private helpers as a casual rollback.

No `.env` files, credentials, model settings, subscription catalog or billing code were edited. Unrelated billing changes in the worktree were preserved.

## File map

| Area | Main files |
|---|---|
| Contracts/defaults/slots | `src/lib/presentations/{families,schema,registry,drafts,content,editing,visual-settings}.ts` |
| Linear units and domain rules | `src/lib/presentations/measurements.ts`, `phase-4-validation.ts`, existing `validation.ts` |
| Authoring/posters | `src/features/presentations/components/Phase4ContentEditor.tsx`, `ContentEditor.tsx`, `TemplatePoster.tsx`, `VisualSettingsPanel.tsx` |
| Rendering/fit/export boundary | `src/remotion/presentations/Phase4Families.tsx`, `Stage.tsx`, `ScenePresentation.tsx`, `src/remotion/Root.tsx` |
| Additive activation | `db/add-documentary-phase-4.sql`; existing manual action's setup-error guidance |
| Verification | `tests/presentations/phase-4-{fixtures.mjs,sql.test.mjs}`, `phase-4.test.mjs`; Phase 2 compatibility fixtures and all-family server regression |
| Render/browser runners | `scripts/presentations/render-phase-4.mjs`, `check-phase-4-ui.mjs`; original ten-family render runner stays bounded to its original catalog |

The coding-standards skill guided pure, immutable content/measurement helpers, separate family authoring/render components, strict contracts and reuse of the existing persistence/provider boundaries. It did not trigger a broad rewrite of earlier phases.

## Recorded local verification

| Check | Result |
|---|---|
| Full presentation suite | **72 tests passed**: all 63 earlier test groups plus nine new Phase 4 groups. The actual save/export server regression now exercises all fourteen families. |
| Actual isolated SQL | Phase 4 applied twice after prerequisites; source ownership, private helper access, new-family rules, Visuals CAS/allowlist, revision conflicts, stale registry hash, AI origin/lock/replay and sign-out checked. |
| New manual UI | **11 workflow groups passed**, zero unexpected browser errors: four real editors/Players, three ratios, source gates, real converted 1:2 heights, values-only/attributed fallbacks, exact range/passage preservation, Apply/Undo, family opt-out and mobile/Escape. |
| Existing manual-library UI | **15 workflow groups passed**, zero unexpected browser errors. |
| Existing AI-review UI | **10 workflow groups passed**, zero unexpected browser errors, including locks/manual scope, editable approval, stale inputs, partial outcomes and interrupted identities. |
| Render acceptance | **97 stills and four H.264 clips**, zero unexpected failures/errors. Main matrix: four families × two themes × three ratios × entrance/hold/exit. Additional captures: max step/item counts, causal support, length baseline, values-only, approximate range, object evidence, attributed context and a dense portrait case. |
| Intentional render rejection | **Five** unsafe cases rejected: dense landscape/square copy and excessive preserved passage newlines in all three ratios. The denser text legitimately fits tall portrait; that fit is accepted, not artificially rejected. |
| Type/build/lint | `tsc --noEmit` and production build passed. Focused ESLint: zero errors; one existing `RegionEditor.tsx` native-image warning. |
| Remote rendering/provider | **Not run.** Actual Lambda submission was exercised with a stubbed vendor boundary and selects v3; this is not cloud deployment evidence. |

Evidence:

- `out/presentations-phase-4/acceptance-renders-final/report.json` and accompanying PNG/MP4 files. Additional settled variants are captured at frame 150, after the fourth step's reveal.
- `out/presentations-phase-4/acceptance-ui/report.json`, `mobile-phase-4.png`.
- `out/presentations-phase-2/phase-4-regression-final/report.json`.
- `out/presentations-phase-3/phase-4-regression-final/report.json`.

Initial render failures exposed square-layout crowding and internal vertical overflow; those were repaired and the final matrix rerun. Failed exploratory artifacts remain in separate ignored folders, not mixed with acceptance evidence. The browser bundler required approved read-only parent-directory access outside the Windows sandbox. No remote API or database was used by these browser harnesses.

Reproduce using fresh artifact labels (runners refuse to overwrite an existing folder):

```powershell
node --test tests/presentations/*.test.mjs
npm run typecheck
npm run build
node scripts/presentations/check-phase-4-ui.mjs fresh-ui-label
node scripts/presentations/check-phase-2-ui.mjs fresh-manual-regression-label
node scripts/presentations/check-phase-3-ui.mjs fresh-review-regression-label
node scripts/presentations/render-phase-4.mjs fresh-render-label
```

Earlier full legacy/v2 still matrices are prior-phase evidence, not newly rerun matrices in Phase 4. Current regression coverage includes actual earlier editors/Players, legacy contracts, timing and owned export paths.

## Release gates and next phase

1. Select staging, retain a recoverable backup/inventory, and review/apply all presentation migrations in order through Phase 4. Establish real owner authentication and verify RLS and concurrent creator operations.
2. Deploy a compatible renderer with v3; compare local preview/export/deployed output using real owned media, fonts, captions, source credits and each supported ratio. Do not activate new layouts against an old v2-only bundle.
3. Approve actual channel source packets and scenes. Review whether D11 describes genuine causation versus chronology, D12 measurements use supported documented units, D13 retains uncertainty, and D14 separates tradition/explanation from archaeological evidence.
4. Verify distinct long credits and realistic script/copy lengths; split scenes when fit/reading-time checks reject them. Placeholder layout illustrations here are not approved pilot evidence.
5. Complete Phase 3's billing/catalog, cap settlement, host-duration, provider refusal/timeout/reconciliation and human AI suitability checks before deliberately enabling paid suggestions. No unattended auto-apply is introduced.
6. Authorize Phase 5 separately and provide its required curated datasets/prepared assets. Phase 5 has not started.

**Phase 4 local implementation is complete. Hosted activation and editorial pilot acceptance remain open.**
