# Documentary presentation library — Phase 2 readiness

Reviewed on 2026-10-07 (Asia/Manila).

**Status:** The ten-family manual library is implemented and locally verified. Database activation, a real authenticated project workflow, deployed cloud rendering, and human review of approved Enoch/Mesopotamia sequences remain release gates. No remote migration, deployment, provider generation, or Phase 3 AI selection was performed.

This extends the [Phase 1 vertical slice](phase-1-readiness.md) under [plan 26](../../implementation_plans/26-documentary-scene-template-library.md). The prior readiness reports describe their verification at that point in time; this report records the expanded implementation.

## Manual library delivered

| Family | Implemented authoring and rendering | Deliberate bounds |
|---|---|---|
| D01 Historical Timeline | Dated events, optional images, source credits, authored cues, horizontal/vertical layouts, equal or proportional spacing. | 1–5 events. Historical BCE/CE has no year zero. Proportional spacing requires distinct ordered exact years, not approximate dates or ranges. Dates too close to label legibly require equal spacing. |
| D02 Person Introduction | Portrait entering from either side, separately staggered role/name, optional affiliation/dates, framed image or supplied cutout. A text-only introduction is supported. | Name/role up to 80 characters; actual fit still checked. No automatic identity lookup or background removal. |
| D03 Image Comparison | Existing paired images, labels, crop/focal controls, swap, source credits, responsive stack, scale/fade entrance. Expanded theme/background choices for new v2 drafts. | Exactly two owned ready images. Saved v1 layouts remain version-pinned. |
| D04 Archival Explainer | Paper card, heading, supplied explanation or quotation, up to four precisely selected highlights with cues. | Body up to 550 characters; exact whitespace and UTF-16 offsets retained, with grapheme-safe selection validation. Quotes require attribution. Explanations are labeled as explanations, not manuscript facsimiles. |
| D05 Map Locator | Bundled West Asia reference map, authored coordinates, numbered markers/legend, approximate locations, authored viewport. | 1–4 markers; 20–65°E and 12–50°N. No geocoding, territory animation, ancient borders, or automatically approved site coordinates. |
| D06 Artifact Spotlight | Actual object image, heading and up to four supplied metadata pairs. | Image must be owned and ready; catalogue/material/date values are creator-supplied, not inferred. |
| D07 Detail Zoom / Annotation | Original image with numbered rectangles and source-faithful detail inset; drag editor plus numeric coordinates and cues. | 1–3 regions normalized to the original image, not the fitted preview. Native region dimensions must be at least 60 pixels in both directions. No invented detail/upscaling or OCR. |
| D08 Manuscript Highlight | Actual page, selected region, edition/folio, optional supplied excerpt and translation. | One authored region; edition/folio required. Same source-resolution protection as D07. No automatic transcription or translation. |
| D09 Original Text → Translation | Supplied original/translation/transliteration, language/script/direction, edition and credit, whole-phrase reveal. | Bounded Latin, Hebrew, Syriac, Ethiopic and cuneiform paths; unsupported characters require a creator-reviewed transliteration fallback. Font samples are not approved scholarly translations. |
| D10 Relationship Diagram | Deterministic chain, hub and tree layouts; optional node images; source-labeled, typed edges and numbered legend. | 2–6 nodes, 1–7 authored edges. Missing/duplicate/self references, disconnected structures, ambiguous parents and crossing layouts are rejected. No inferred genealogy or force-directed graph. |

An explicit **Use clean media** choice remains available. It creates no new graphic and does not delete independent legacy overlays.

## Creator workflow and UI

### Presentation library and inspector

- Open **Presentation → Browse templates** for the selected scene in the Timeline Editor or Scene Board inspector.
- Search by name or storytelling purpose. Cards show the family code, schematic poster, asset requirements and typical hold; they do not instantiate ten animated Players or inject sample historical facts.
- Choose a family and fill its own fields. Required copy/assets start blank; each family's unsaved draft is retained while browsing within the open editor.
- Reorder authored event/node rows without losing IDs, source metadata or cue times. Image slots retain media IDs, crop/fit and focal points.
- Edit exact text selections, original-image regions, coordinates, dates and graph edges through explicit controls. The compiler reports field-specific repairs for invalid content.
- Set theme, accent, motion, supported background, density and local timing. Preview unsaved content at 16:9, 9:16 or 1:1 with safe guides; preview ratio does not change the project export ratio.
- Apply through the existing owned, revision-protected transaction. Keep my edits is on by default and restored by content/style/timing edits. Remove and one-step session-local Undo use that same transaction.

The modal remains responsive, keyboard-focus constrained and dismissible with Escape. Scene Board cards use static presentation badges/posters; only the selected inspector opens the live preview. Ready linked scene media is resolved from the project media table, while older schemas retain their existing custom-media fallback.

Actual font-loaded layout is checked, not guessed from character count. Content wraps at readable fixed sizes. Overflow or collisions disable Apply and block rendering with a repair message; copy is not silently shrunk, shortened or rewritten. A successful draft can be recovered after shortening invalid copy. Caption-safe layout and source-credit space are shared by the families.

### Channel and project Visuals

**Channel Settings → Visuals** now controls theme pack v2, default motion/background/density, offered families, date-label convention and optional accent. Saving Visuals narrowly merges only `format_blueprint.visual.presentation` and advances the channel revision; it does not overwrite unrelated Format fields.

New videos freeze these defaults inside the existing Format Blueprint snapshot. Existing videos keep their frozen snapshot. **Project Visuals** in the Timeline Editor can store a separate project override for new drafts without mutating that snapshot or existing presentations.

Explicit **Apply to selected unlocked scene** / **Apply to all unlocked presentations** requires confirmation. It preserves copy, crops, sources, cues and timing. Locked presentations and Clean are skipped. Each scene saves through its own revision check, and conflicts/partial success are reported; this is not an atomic whole-project restyle or a durable multi-scene history feature.

Hiding a family only affects new browsing; saved presentations of that family remain editable. Numeric date labels can explicitly use BCE/CE or BC/AD; supplied date text is never automatically rewritten. The clearly labeled **Future AI suggestion preference** is stored for Phase 3 only and has no selection effect now.

## Visual system, sources and assets

- **Dark Documentary** and **Parchment Archive** now have shared v2 surface/text/accent/credit tokens across all ten families, with plain, curved-grid, procedural-paper and halo backgrounds. Density changes spacing, not text legibility.
- Calm and standard entrances use bounded easing; expressive motion uses a spring. No unbounded random motion or frame-dependent graph layout is introduced.
- Existing D03 theme v1 remains pinned. New families require v2. Changing defaults does not migrate saved rows; an explicit theme/default/restyle action is required.
- Custom accents get contrast-aware text/label/essential-line colors. Paper highlights preserve the exact supplied text instead of rewriting a quotation for styling.
- Sources retain a credit, optional HTTP(S) link and historical/illustration/reconstruction/unknown classification. Illustration/reconstruction are visibly distinguished; links remain metadata, not fetched text. Credits are bounded and measured as part of the layout.
- Source ownership/readiness is enforced for every declared image slot, including optional timeline/person/graph images. Clients cannot persist arbitrary nested image URLs. Export re-resolves authoritative saved media IDs rather than trusting client URLs.
- Source approval, accuracy and usage rights remain a creator review responsibility. No claim is made that entering a URL proves authenticity or grants permission.

### Bundled map provenance

`west-asia-v1` is a coastline/land reference asset generated from Natural Earth's 1:110m land GeoJSON. Natural Earth declares its map data public domain in its [official terms of use](https://www.naturalearthdata.com/about/terms-of-use/). The input is the [Natural Earth vector repository's land dataset](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), downloaded as raw GeoJSON.

- Input SHA-256: `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9`.
- Generator: `scripts/presentations/generate-map.mjs`; it checks the reviewed input hash before mechanical conversion.
- Output: `src/remotion/presentations/west-asia-v1.ts`, clipped to the declared bounds.
- Projection: equirectangular with standard parallel 32°N (`x = longitude × cos(32°)`, `y = −latitude`). Viewport zoom and marker coordinates use the same transform in all three ratios.
- The graphic visibly identifies itself as a modern geographic reference, not evidence of ancient political borders. Low-resolution global coastline data is not a site survey or an archaeological map.

The public dataset download did not send project content. No external geocoding provider or runtime map request is needed to render this asset.

### Script and region verification limits

D09 loads declared Noto font subsets for Hebrew, Syriac, Ethiopic and cuneiform, alongside Latin/Latin-ext typography. Explicit RTL is required for Hebrew/Syriac, and the supplied text is direction-isolated. No per-character typing animation breaks combining marks. Unsupported scripts require an explicitly reviewed transliteration-only fallback rather than a promise of universal font coverage.

The tested glyph strings establish rendering for those samples, not scholarly correctness, universal language coverage, or completeness of every rare character. Real passages still need a readable original, approved translation/edition and channel review.

D07/D08 rectangles are authored in source-normalized coordinates. The inset renders the selected original pixel region; fit, preview size and aspect ratio do not change that selection. Native-image dimensions are loaded before rendering, and insufficient source detail fails explicitly. Synthetic test images are illustrations, not facsimiles or documentary evidence.

## Architecture and persistence

The implementation keeps distinct content schemas and family renderers over shared stage, theme, source, layout and asset primitives. Pure compiler/editing helpers use explicit image/source slots and immutable updates. No provider orchestration or generalized template-builder system was added.

The additive **`db/add-documentary-template-library.sql`** migration is authored and isolated-tested, **not applied to a live environment**. It requires:

1. The existing workspace/project/scene/media tables and `db/add-channel-blueprint.sql`.
2. The Phase 1 overlay prerequisites (`create-overlay-clips.sql`, `add-overlay-clip-templates.sql`, `add-overlay-ai-origin.sql`) and `db/add-scene-template-presentations.sql`.
3. Then the Phase 2 migration.

Do not rerun the legacy overlay table-creation script after enabling the owned policies; it disables RLS. These are dependency references, not authorization to run migrations.

Phase 2 expands the owned scene-presentation RPC to the known family/version/asset allowlist without weakening Phase 1 authentication, scene ownership, expected-ID/revision, retry identity, source-media ownership, protected direct writes or cascade behavior. Saved schema/template versions remain explicit; unsupported rows are retained and block editing/export instead of being silently deleted or converted.

New project Visuals use `presentation_visual_settings` and a separate revision. Workspace Visuals and manual Format saves use narrow, owned compare-and-swap RPCs. Format saves preserve independently saved presentation defaults; stale Format/Visuals writes fail rather than clobbering one another. A database guard prevents direct authenticated updates from bypassing this path.

**Activation dependency:** Manual Channel Format saves now also require the Phase 2 `save_channel_format_cas` RPC. Deploying only the web change without its reviewed migration leaves those saves in a useful setup/error state; no unprotected fallback is used. Unrelated project updates remain unaffected by the Visuals guard.

Preview/local rendering exposes `MainVideo`, `MainVideo-Documentary-v1` and **`MainVideo-Documentary-v2`**. Any v2 presentation requires the v2 cloud composition alias. An older deployed site must fail rather than silently omit a saved family. This compatibility boundary is not evidence that AWS fonts/media access has been verified.

## Local verification evidence

| Check | Result |
|---|---|
| Presentation test suite | **50 passed**, including the Phase 0/1 regressions and new family/source/date/script/graph/settings cases. |
| Actual Phase 2 migration in isolated PGlite | Applied twice. All ten families, owned assets/access, retry/revision handling, direct-write guards, independent Visuals/Format CAS and frozen snapshots verified. No live Supabase migration. |
| Actual action/context/export code with Supabase I/O stubbed | All-family save/export, owned project context, unsupported-row blockers, project overrides, settings validation/conflicts and authoritative media resolution verified. Not a real authenticated end-to-end session. |
| Actual cloud preparation/submission with Lambda I/O stubbed | Nested assets and required v2 composition selection verified. **No AWS request.** |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed after final changes. |
| Focused Phase 2 lint | Zero errors; one `no-img-element` warning for the region editor's native image used to obtain original pixel dimensions. Whole-repository lint is not claimed clean; unrelated pre-existing diagnostics were not rewritten. |
| Shared Remotion final matrix | **180 PNG stills and three eight-second H.264 clips**, all ten families × two themes × three ratios, entrance/hold/exit and captions. Zero unexpected browser errors or failures. |
| Additional edge renders | **39 PNG stills**: five script samples, six-node chain/hub/tree, mirrored long person, source-space regions, zoomed map, BCE/CE proportional timeline and repeated exact highlight, across all ratios. **Six expected rejections** for excessive copy or insufficient native source resolution; no unexpected errors. |
| Actual Phase 2 Presentation/Visuals UI and Player browser fixture | **15 named workflow groups passed**, zero unexpected errors: all nine added family editors/previews/Apply, purpose search, region pointer drag, per-family drafts, unchanged scenes on default save, stale-settings draft retention, mobile and keyboard dismissal. Save I/O is isolated, not live Supabase. |
| Phase 1 browser regression against expanded UI | **13 checks passed** and three screenshots; five expected error-boundary diagnostics during deliberate comparison overflow/recovery, no unexpected errors. |
| Legacy recheck | **60 fixtures rendered**, zero browser errors; **59 PNG hashes identical** to the Phase 1 reference. The remaining AI-title portrait has 46 changed pixels / 57 channel values, maximum delta 8/255, with no observed layout/content change. Not 60 byte-identical captures. |

Verified local artifacts are ignored by Git:

- `out/presentations-phase-2/final-matrix/`: full matrix, three clips and report.
- `out/presentations-phase-2/final-edges/`: additional samples and expected-rejection report.
- `out/presentations-phase-2/final-ui/`: mobile library screenshot and 15-group report.
- `out/presentations-phase-1/phase-2-regression/`: comparison UI regression and screenshots.
- `out/presentations-phase-0/phase-2-legacy/`: legacy captures and hash comparison report.

The full matrix was rerun after the final visual adjustments. Edge fixtures were verified separately; they are not a claim of every maximum-copy/source combination fitting. Glyph/source fixtures are test content, not human-approved pilot episodes. Non-fatal bundler cache warnings do not constitute a render failure.

### Repeat verification

Use unused capture labels; the render runners refuse to overwrite a capture directory.

```powershell
node --test tests/presentations/*.test.mjs
npm run typecheck
npm run build
npx eslint --no-ignore src/lib/presentations src/remotion/presentations src/features/presentations src/features/channel-settings/components/SettingsTabs.tsx src/features/channel-settings/components/ChannelFormatSection.tsx src/features/channel-settings/server/format-actions.ts src/features/scene-board/server/scene-board-actions.ts tests/presentations/phase-2* scripts/presentations/generate-map.mjs scripts/presentations/render-phase-2*.mjs scripts/presentations/check-phase-2-ui.mjs
node scripts/presentations/render-phase-2.mjs review-matrix-new
node scripts/presentations/render-phase-2-edge-cases.mjs review-edges-new
node scripts/presentations/check-phase-2-ui.mjs review-ui-new
node scripts/presentations/check-ui.mjs review-comparison-new
node scripts/presentations/render-baseline.mjs review-legacy-new phase-1-legacy
```

Browser/font access is required. On this Windows sandbox, the isolated browser runners required approved execution outside the sandbox; that approval was not used to access customer content or deploy anything.

## Activation, human review and recovery

1. **Choose the environment and review its data/policies.** Retain the read-only Phase 0 inventory and a recoverable backup; inspect migration prerequisites. No environment has been activated by this task.
2. **Establish real authentication and ownership.** The current development proxy bypass is not a signed-in Supabase session. New saves/export must continue to reject unauthenticated or foreign project access; do not loosen these guards to make a demo work.
3. **Coordinate migration and compatible application rollout.** Review/apply the migration to the selected environment before enabling its write paths, including Channel Format CAS. Keep compatible reader/render code available for persisted v1/v2 rows. Verify actual grants/RLS and conflicting tabs there.
4. **For cloud export, deploy a renderer exposing v2 first.** Verify actual uploaded assets, signed URL lifetime, fonts and preview/local/Lambda parity using the same saved scenes. Stubbed tests do not establish hosted parity.
5. **Run a real-project smoke test.** In both Timeline and Scene Board, apply/edit/reload, verify linked media and source rectangles, reorder/trim, conflict/Undo, project/channel defaults and explicit unlocked restyle. Check independent legacy overlays and source-credit/caption collisions.
6. **Review approved channel sequences.** Use a Mesopotamia map/artifact/detail sequence and an Enoch manuscript/original-text/translation sequence, plus a clean-media scene. Supply and review actual assets, rights, coordinates, editions and translations. Those assets were not provided in this task, so this gate remains open.
7. **Recovery preserves saved work.** If activation fails, disable new writes/suggestions and retain the compatible reader/renderer. Do not drop columns, delete saved presentations, bulk-restyle projects or deploy an older reader that cannot understand existing v2 rows. Reconcile partially completed restyles scene by scene.

The **local Phase 2 implementation is complete**. The **hosted and approved-pilot release gate remains open**. Phase 3 AI family selection, source-aware filling and reviewed act workflows have not been started.
