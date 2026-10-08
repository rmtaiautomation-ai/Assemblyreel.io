# Documentary presentation library — Phase 5 readiness

**Reviewed:** 2026-10-08 (Asia/Manila)

**Status:** Phase 5 is implemented and locally/isolated-tested. The library now has **twenty-four documentary families plus explicit Clean**. The ten advanced families are manually authorable and explicitly opt-in for AI selection. Remote database activation, real authenticated creator workflows, deployed v4 rendering, approved Enoch/Mesopotamia sources and prepared assets, paid AI activation and human pilot acceptance remain open.

This extends [Phase 4](phase-4-readiness.md) and [plan 26](../../implementation_plans/26-documentary-scene-template-library.md). All six numbered phases now have local implementation evidence; that is not a claim that the product's hosted/editorial definition of done has passed. No live migration, cloud deployment, paid model request, billing activation or environment change was performed.

## Built templates and editorial boundaries

| Family | Content and controls | Honest limitation / repair |
|---|---|---|
| D15 Journey Map — `journey-map` | Two to five credited stops with coordinates, dates, approximate flags and reveal cues. Static authored viewport on `west-asia-v1`; supplied route import has at most 128 vertices. | Schematic connections are visibly dashed and state that the actual path is unknown. A supplied route must include the stop vertices in order and remain inside the viewport. Invalid import text stays visible until repaired; schematic conversion is an explicit action. No AI-authored route, automatic camera-follow, global map or antimeridian handling. |
| D16 Territory Change — `territory-change` | Two to four dated, credited snapshots; supplied dataset/version label; one to four simple polygon rings per snapshot, three to 64 vertices per ring. Discrete reveals/crossfades with persistent date and reconstruction/approximation context. | Ascending numeric years, no year zero, bounded West Asia coordinates and valid topology are required. Rings are unclosed, nondegenerate, non-self-crossing and nonoverlapping. Historical/reconstruction classification is required; classification is not independent verification. No holes, arbitrary GeoJSON, interpolation of missing borders or morphing that implies unsupported intermediate history. |
| D17 Then and Now — `then-now` | Two durable owned images, credited time labels, normalized source crops, reveal cue, reviewed wipe alignment or explicit side-by-side mode. | Wipe checks actual image dimensions, at least 60 pixels per crop dimension and matching cropped aspect ratios within 1%. This cannot prove the images show the same viewpoint. Creator review is still required. Unaligned images need explicit crop repair or side-by-side; no silent auto-registration or invented reconstruction. |
| D18 Layered Parallax — `layered-parallax` | Two to four owned, registered layers; first full background plate at depth zero, transparent foreground roles at increasing depths, direction, bounded focal point and prepared-asset review. | Renderer checks equal intrinsic image dimensions and applies common registration with overscan and bounded displacement. The creator must supply a complete plate and actually transparent foregrounds: the review flag does not verify alpha quality, segmentation or whether hidden pixels were invented. No background removal, inpainting, depth estimation or asset purchase. |
| D19 Structure Cutaway — `structure-cutaway` | A credited owned diagram, explicit review, two to four normalized section rectangles, labels, explanations and reveal cues. The existing region editor is reused. | Reveals supplied diagram pixels only. It does not discover a real interior, build a 3D structure or infer buried chambers. Out-of-bounds sections and missing diagram review block Apply. |
| D20 Manuscript Comparison — `manuscript-comparison` | Two exact supplied passages, each with edition, language, supported script/direction, transliteration/fallback review and source; up to three authored paired passage mappings and cues. | Text and whitespace are preserved. Editing either passage clears stale mappings; creators select and explicitly relink ranges. Application validation rejects split grapheme clusters and overlapping ranges. No automatic collation, OCR, transcription, translation or invented correspondence. Each passage uses its own script-aware font; unsupported original glyphs require a reviewed transliteration fallback. |
| D21 Evidence Board — `evidence-board` | Three to five credited cards with optional owned images and two to four explicitly labeled, sourced links. A bounded connected tree keeps relationships legible. | Links must connect existing cards without duplicates/self-links; every relationship needs its own explanation and source. Animation emphasizes an authored link, not implied causality or a decorative conspiracy web. Cyclic/general graph layouts and drag-anywhere canvases are outside this version. |
| D22 Animated Chart — `animated-chart` | Bar or line; two to six labeled points, actual numeric x positions, supplied nonnegative values, missing values, optional uncertainty bounds, estimate flags, unit, axis label, source and caveat. | Common zero baseline, actual x spacing, broken lines across missing values and visible uncertainty. No fabricated count-up or interpolation. Bounds must bracket the value; line x positions must ascend with readable spacing. This version rejects negative values, unsupported crowded domains and datasets with no positive observation. Exact values remain in the legend; extreme tick values use bounded scientific notation. |
| D23 Competing Explanations — `competing-explanations` | Two to three attributed explanations, each with supplied support, unresolved limitations and a source. Responsive comparison panels. | Equal presentation space is not equal probability or equal strength of evidence. Square format gives each explanation equal dwell in sequential focus to avoid crowded copy; portrait/landscape retain responsive comparisons. No confidence meter, automatic verdict or removal of uncertainty. |
| D24 Chapter Recap — `chapter-recap` | Two to four takeaways, an earlier-scene picker, linked owned stills, recap heading and next-section cue. | No recursive video/composition rendering. Apply/export recheck that every referenced scene still belongs to the project, precedes the recap and links the same image. Deletion, reorder or relink yields a repair state, not a silently substituted still. The source-approval editor may prepare a packet for a later recap; actual Apply still checks its target. |

Both theme packs, landscape/portrait/square layouts, existing caption-safe margins, source lines and rendered text-fit gates apply. Dense copy is rejected for explicit editing/splitting, not silently shrunk. Template posters and fixtures are schematic illustrations, not approved historical evidence.

All new source slots require credits. Reviewed AI packets additionally require explicit source approval/classification. Geography is restricted to longitude 20–65 and latitude 12–50, matching the existing supplied basemap; a modern geographic outline is not evidence of an ancient border.

## UI and workflow

- All ten families have purpose-search descriptions, distinct schematic posters, family-specific Content controls and the shared Sources, Style, Timing and paused Player preview.
- Reuse the same inspector from Scene Board, Timeline and source/suggestion review. No separate editor, new paid asset workflow or unattended auto-apply is introduced.
- Maps expose supplied geometry, dated states and source review; malformed geometry is preserved visibly while readiness is blocked. Image templates expose explicit preparation/alignment controls instead of ignored generic fit/focal options.
- Manuscript controls support paired text selections; chart controls retain nulls, estimates and uncertainty; recap controls use current scene references rather than pasted image URLs.
- Existing manual Apply/Undo, lock/revision protections, independent family drafts and explicit manual replacement permissions are retained.
- **New default settings remain D01–D14.** Saved channel settings, project overrides and frozen snapshots are not widened. Enable desired advanced families in Channel Visuals for future videos or Project Visuals for an existing video. Saving settings does not mutate saved scenes.
- A current-source change can invalidate an already saved recap. The badge/preview exposes the issue and authoritative export blocks it; automatic replacement is deliberately not performed.

## AI and authoritative persistence

The director can select an advanced family only when the project enables it and a reviewed, typed packet meets its current requirements. The model still chooses approved IDs and exact cue occurrences; it does not author historical borders, route vertices, chart numbers, passages, image preparation or recap assets. Selection copies the approved content unchanged. Missing packets/assets stay non-ready repair candidates.

The existing provider, billing adapter, request/apply identities, pacing, locks, stale hashes and per-scene outcomes are unchanged. Paid suggestions remain off unless deliberately activated with an approved billing policy. Local stubbed-provider tests are not evidence of live model suitability.

Manual saves obtain current owned scene references for recaps. Export uses authoritative owned scenes/media, ignores client-supplied presentation URLs, resolves all declared image slots and revalidates references. A partial export that omits a referenced earlier scene currently fails recap validation; export the complete referenced sequence or revise the recap explicitly. Database triggers enforce new content/source/reference constraints for writes through existing manual and reviewed-AI services.

## Compatibility and database activation

The new additive file is **`db/add-documentary-phase-5.sql`**, after the Phase 1, Phase 2, Phase 3 and Phase 4 presentation migrations. It was applied twice in isolated PGlite, **not to Supabase or another live database**.

- Existing CAS/manual and reviewed-AI RPCs retain ownership, origin, lock, replay and stale-input protections. New triggers guard advanced scene content and source packets without adding a parallel save path.
- Earlier image-slot validation is retained behind a private Phase 4 helper. New explicit nested image slots use the existing owned-media checks. The Visuals allowlist expands to 24 without rewriting saved settings.
- A pinned strict JSON shape contract is generated from the actual Zod schemas and compared in tests. Bounded SQL geometry/data checks reject malformed structures and dishonest combinations before persistence. Private helpers remain inaccessible to ordinary authenticated users.
- Manuscript SQL checks UTF-16 range bounds, astral-code-point boundaries and overlaps. **Full combining-mark/grapheme and selected-script coverage checks remain application/compiler responsibilities**, not a claimed SQL equivalent. Export revalidates them.
- Recap checks lock referenced scene rows while validating current ownership, sequence and linked media. Later legitimate source changes do not silently rewrite the recap; preview/export demand repair.
- Snapshot registry revision becomes `3`; the changed hash makes older proposals stale. It does not rewrite previous presentations or source packets.
- New/mixed projects containing D15–D24 require **`MainVideo-Documentary-v4`**. Legacy, v1, v2 and v3 IDs stay registered. An old hosted bundle must fail preflight rather than silently omit advanced graphics.
- Apply migrations in order through Phase 5. Rerunning an earlier migration alone can replace a newer wrapper/function and is not a safe downgrade.
- Roll back availability/paid generation while retaining compatible readers and renderers. Do not delete source packets, existing presentations or retained private helpers as a casual rollback.

No `.env` file, credentials, model setting, package/dependency, subscription catalog or billing implementation was changed. Earlier unrelated worktree changes were preserved.

## File map

| Area | Main files |
|---|---|
| Strict contracts and reusable primitives | `src/lib/presentations/advanced-families.ts`, `primitives.ts`, existing `families.ts`, `schema.ts`, `registry.ts` |
| Geometry, current references and immutable slots | `geometry.ts`, `phase-5-validation.ts`, `advanced-editing.ts`, existing compiler/content/editing services |
| Authoring | `src/features/presentations/components/Phase5ContentEditor.tsx`, `AdvancedMapEditor.tsx`, `GeometryField.tsx`, `AdvancedImageEditor.tsx`, `AdvancedTextEditor.tsx`, `ChartEditor.tsx`, `Phase5Poster.tsx` |
| Rendering | `src/remotion/presentations/Phase5Families.tsx`, `AdvancedMaps.tsx`, `AdvancedImages.tsx`, `PreparedImages.tsx`, `AdvancedSources.tsx`, `AnimatedChart.tsx`; existing Stage/ScenePresentation and Root registration |
| Current-reference and AI integration | Existing PresentationPanel, Scene Board, Timeline, SuggestionReview, suggestion service/actions and authoritative export loader |
| Additive activation and schema drift check | `db/add-documentary-phase-5.sql`, `scripts/presentations/phase-5-shape-contract.mjs` |
| Verification | `tests/presentations/phase-5.test.mjs`, `phase-5-sql.test.mjs`, `phase-5-server.test.mjs`, `phase-5-fixtures.mjs`, `phase-5-ui-entry.tsx`, prepared SVG fixture |
| Render/browser runners | `scripts/presentations/render-phase-5.mjs`, `check-phase-5-ui.mjs`; earlier browser harnesses retained for regressions |

The coding-standards skill guided pure geometry/reference helpers, immutable source/asset edits, separate family editors/renderers and reuse of existing persistence/provider boundaries. It did not introduce a broad rewrite of earlier phases.

## Recorded local verification

| Check | Result |
|---|---|
| Full presentation suite | **85 tests passed**, zero failures/skips: 72 earlier groups plus ten new contract/integration groups, actual Phase 5 SQL and two real save/export groups. |
| Isolated SQL | Ordered migrations through Phase 5, Phase 5 applied twice; shape parity, private access, ownership, CAS, source classification, geometry/data, recap reorder/relink, Visuals allowlist, stale registry hash, AI origin/lock/replay checked. |
| Advanced manual UI | **18 workflow groups passed**, zero unexpected browser errors: ten actual editors/Players across three ratios, locks/Apply/Undo, opt-in settings, explicit geometry/alignment/preparation repairs, paired passage mapping, chart bounds/missing values, recap changes and mobile/Escape. |
| Original manual-library UI | **15 workflow groups passed**, zero unexpected browser errors. |
| Existing AI-review UI | **10 workflow groups passed**, zero unexpected browser errors, including manual scope, stale proposals, editable approval, partial success and interrupted identities. |
| Phase 4 manual UI | **11 workflow groups passed**, zero unexpected browser errors. |
| Render acceptance | **251 stills and ten eight-second H.264 clips**, zero unexpected failures/errors. Two themes, three ratios, entrance/hold/exit, maximum content, supplied routes, side-by-side, alternate line/uncertainty cases, intermediate cues, square explanation focus, extreme chart values and additional 24/60 FPS still checks. |
| Intentional render rejection | **Six** expected failures: unsafe preserved newlines in all three ratios, mismatched prepared-layer dimensions, mismatched wipe crop aspect ratio and a tiny source crop. |
| Type/build/lint | `tsc --noEmit` and final production build passed. Focused ESLint with `--no-ignore`: zero errors; one existing `RegionEditor.tsx` native-image warning. |
| Cloud/provider | **Not run.** Actual Lambda submission logic was tested with a stubbed vendor boundary and selects v4; no AWS or model request was made. |

Final evidence, separate from exploratory runs:

- `out/presentations-phase-5/acceptance-renders-final/report.json` and accompanying PNG/MP4 files.
- `out/presentations-phase-5/acceptance-ui-final/report.json`, `mobile-phase-5.png`.
- `out/presentations-phase-2/phase-5-regression/report.json`.
- `out/presentations-phase-3/phase-5-regression/report.json`.
- `out/presentations-phase-4/phase-5-regression/report.json`.

The final local render run took **175.761 seconds** overall. Individual eight-second landscape clips took **7.364–7.570 seconds** each at output scale **0.4**, 30 FPS, two render workers and synthetic local media. These are recorded local timings, not full-resolution benchmarks, long-form throughput, Lambda costs or a hosted SLA. Still matrices cover the three authored aspect ratios; the videos themselves are landscape samples, not a full three-ratio video matrix.

Representative final stills were visually inspected, including dashed journeys, chart tick readability/extreme values, every square explanation focus state, aligned wipe and maximum prepared layers. Automated fits/clips do not replace human motion/editorial review with actual channel assets. Earlier legacy/v2/v3 full render matrices are prior-phase evidence, not newly rerun full matrices here.

Exploratory QA exposed a real crop-aspect mismatch, square explanation crowding, shortened schematic route dashes and small letterboxed chart ticks. These were repaired before the final render pass. Prepared images now wait for actual intrinsic dimensions; SVG clipping IDs are stable per rendered instance. Browser fixture URL and flex-style warning issues were also repaired. The browser bundler required approved read-only ancestor-directory access outside the Windows sandbox; these harnesses used only local synthetic data and persistence/provider stubs.

Reproduce with fresh output labels (runners refuse to overwrite existing folders):

```powershell
node --test tests/presentations/*.test.mjs
npm run typecheck
npm run build
node scripts/presentations/check-phase-5-ui.mjs fresh-advanced-ui-label
node scripts/presentations/check-phase-2-ui.mjs fresh-manual-regression-label
node scripts/presentations/check-phase-3-ui.mjs fresh-review-regression-label
node scripts/presentations/check-phase-4-ui.mjs fresh-phase-4-regression-label
node scripts/presentations/render-phase-5.mjs fresh-advanced-render-label
```

## Release gates and next work

1. Review the twenty-four-family catalog and bounded advanced behavior. Choose the enabled advanced families per channel/project; retain Clean and the simpler layouts where data/assets are insufficient.
2. Select staging, take a recoverable backup/inventory, review/apply all presentation migrations through Phase 5 and verify real authenticated ownership/RLS, concurrent creator edits and source/reference repairs. No live database was touched by this phase.
3. Deploy a compatible v4 renderer. Check full-resolution preview/local/hosted parity using real owned media, script fonts, captions and realistic credits in every ratio; confirm old composition IDs still work.
4. Supply approved Enoch/Mesopotamia datasets and prepared assets. Review historical border uncertainty, route provenance, crop correspondence, cutaway accuracy, complete parallax plates/transparency and exact manuscript editions/mappings. Review flags and source classification do not fact-check the content.
5. Complete short- and long-form human pilots, including actual motion, realistic copy/credit lengths, dense mobile layouts and recap changes after scene edits. Synthetic fixtures are not channel pilots.
6. Complete Phase 3's approved billing/catalog, cap settlement, host-duration, provider refusal/timeout/reconciliation and human AI suitability checks before deliberately enabling paid suggestions. This phase adds no unattended auto-apply or paid procurement.

**Phase 5 local implementation is complete. All numbered phases are locally implemented; staged activation and real-source production acceptance remain open.**
