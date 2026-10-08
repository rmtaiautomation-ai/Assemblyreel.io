# 27 — Timeline Navigation Stability and Performance

> Created / repository audit: 2026-10-08 (Asia/Manila)
>
> Status: Phases 0–5 approved and implemented locally on 2026-10-08. Phase 0 real-browser baseline and Phase 5 browser performance/audio acceptance remain pending; local Phase 5 operation counts and regressions passed. Phases 6–7 await approval. See [Phases 0–3 delivery](27-phases-0-3-delivery.md), [Phase 4 delivery](27-phase-4-delivery.md), and [Phase 5 delivery](27-phase-5-delivery.md).
>
> Goal: Reliable scene selection and editing, a clearer timeline, and responsive navigation for short-, medium-, and long-form projects while preserving narration alignment and export behavior.

## 1. Recommendation

Fix interaction correctness first, simplify the labels second, and optimize measured rendering costs third. The timeline should remain a view of the existing scene and clip timing model.

Keep a compact scene number such as **S7**. Remove the complete narration sentence from the default V1 clip label. Put narration in the selected scene inspector and an on-demand hover/focus detail view. Do not remove narration from storage, generation inputs, captions, or export.

A smoother editor is achievable. Removing text alone will mainly improve clarity; rendering frequency, thumbnail DOM, media decoding, and competing selection/gesture handlers are the more consequential areas to measure.

## 2. Audit evidence and limits

Reviewed the current timeline editor, scene/overlay/audio interactions, presentation controls, preview composition, persistence helpers, ESLint configuration, and existing timeline tests. Source locations below refer to this audit snapshot and can shift during implementation.

- [TimelineEditor.tsx](../src/features/timeline-editor/components/TimelineEditor.tsx): approximately 10,106 lines and 88 state hooks. Size is a maintenance and isolation concern, not proof of a specific performance bottleneck.
- Existing selection/transition/layout tests: **12 passed** during this audit.
- Isolated execution of the actual scene selection handler successfully followed **5 → 8 → 6 → 7 → 8 → 9**.
- The same selection probe retained a previously selected overlay after selecting a scene.
- An isolated audio-generation completion probe applied Scene 7's audio URL to Scene 8's selected inspector after navigation. The Scene 7 row was updated correctly; the selected Scene 8 copy was incorrect.
- An isolated transition-handle probe started with duration 1.1s and a stale handle dataset value of 0.7s. A press/release without movement persisted 0.7s.
- A 600px scene scaled to 1.07 occupies 642px, extending 21px into each neighbor when scaled around its center. The selected scene also has a higher stacking level than unselected scenes.

**Not yet established:** which browser element received the user's missed clicks, whether those clicks were near edges or in the clip center, and whether an active drag or pending background operation was involved. The browser connection was unavailable in this session. Passing isolated handler tests does not verify browser event delivery, layout, pointer cancellation, or perceived responsiveness.

Do not attribute every missed click to scaling. If center clicks fail too, prioritize event delivery traces, gesture cleanup, competing selection, and main-thread stalls.

## 3. Findings and priority

| Priority | Finding | Evidence | Effect and proposed action |
|---|---|---|---|
| P0 | Selected blocks enlarge into adjacent hit areas | SELECTED_BLOCK_SCALE and blockTransform, around lines 576–579; selected/unselected stacking around 4685; geometry probe | Confirmed overlap geometry; plausible cause of boundary clicks selecting the old scene. Replace horizontal scaling with an inset outline and subtle shading. Keep timing coordinates and widths exact. |
| P0 | Selection kinds are not mutually exclusive | handleSelectSceneBlock around 2974 does not clear selectedOverlayClipId; overlay inspector takes precedence around 5563 | Reproduced retained overlay selection. Centralize scene/overlay/clip/act selection and clear incompatible focus. |
| P0 | Async results can modify the currently selected scene instead of their originating scene | handleRegenerateSingleAudio around 2138–2144; audio/visual/bulk completion paths around 2103, 3239, 3282, 3494 | Reproduced wrong audio URL in Scene 8's selected copy. Match the target ID inside the latest state updater; do not trust a selection captured before await. |
| P0 | Selected scene is a duplicate object separate from scenes | State around 683 and 710; updates distributed throughout the component | Confirmed structural risk of stale inspector data. Move toward selecting stable IDs and deriving the current row, in bounded steps. Keep draft fields separate from saved row state. |
| P0 | Transition press/release can reuse an old duration | Transition handle dataset.newDuration writes/reads around 4937–4945 and 4974–4982 | Reproduced duration reset on a click. Initialize each gesture, persist only real changes, and remove stale gesture data. |
| P0 | Transition/overlay gestures have incomplete cancellation coverage | Transition handles install pointermove/pointerup only; overlay handlers around 2657–2912 remove window listeners only on pointerup | Confirmed missing cleanup paths; stuck gestures are a risk, not browser-reproduced yet. Handle pointercancel, lost capture, unmount, and interruption with defined cleanup. Preserve the scene resize path's existing pointercancel support. |
| P1 | Scene bodies combine native draggable behavior with click and resize controls | V1 block around 4745–4776; handles around 4858 and 4917 | Small motion may become a native drag before click. Verify in browser; define an intentional drag threshold or a dedicated reorder grip, and keep body selection immediate. |
| P1 | Background deselection and act/clip selection clear different subsets of state | V1 background around 9106; act selection around 9364; Escape around 3842 | Selection count, inspector focus, and highlighted item can disagree. Define consistent background, Escape, and cross-track behavior. |
| P1 | Generic scene writes can fail with only console feedback | persistSceneFields around 2158–2165 deletes queued payload before response; 800ms text debounce | A visible edit can fail to persist unnoticed. Retain failed writes, show save state, and flush pending edits before in-app route changes. Do not claim tab-close flushing is guaranteed. |
| P1 | Render and interaction failure recovery is uneven | Main Player around 8292 has no explicit recovery UI; outer inspector reads selectedScene.id directly around 6971 | The Player has its own composition error handling, but outer inspector errors are outside that boundary. Add scoped inspector recovery and main preview retry, plus explicit catches/validation for async and event errors. |
| P1 | Keyboard handlers have inconsistent focus guards | Delete/select-all guard around 3144; Space/Escape guard around 3831 | SELECT and contenteditable/modal focus can reach unrelated timeline actions. Scope shortcuts to the editor and let active dialogs/inputs own their keys. |
| P1 | Source lint is globally ignored | eslint.config.mjs includes src/** | Normal lint does not protect changed editor source. Establish a targeted source lint gate without taking on unrelated repository-wide cleanup. |
| P2 | Playback updates top-level state at animation-frame frequency | setCursorPosition in animate around 3996; media-ref scan around 4052; sync effect around 4128 | Confirmed recurring work; actual timing cost unmeasured. Separate high-frequency playhead/transport updates from inspector and track rendering while retaining the audio clock and seek rules. |
| P2 | Partial virtualization and expensive visual detail | V1/A1 use visibleSceneEntries; OV and A2 map all clips; static filmstrip creates repeated img nodes around 4815 | Keep existing virtualization, extend it to rendered overlays/audio clips, and cap thumbnail detail. Compute overlay lane placement from the full clip set before filtering visible clips. |
| P2 | Repeated presentation lookups and unstable inspector inputs | remotionScenes/presentationIssues around 4219–4230; inline sceneReferences array around 6979; PresentationPanel around 49–52 | Build shared scene/reference indexes and stable inputs; cache only with complete dependencies. Measure before introducing more machinery. |
| P2 | Waveform paths are rebuilt and are decorative | Long-form A1 path around 9402 uses trigonometric samples rather than audio amplitudes | Cache paths. Treat genuine waveform generation as a separate enhancement; label decorative display honestly. Do not add heavy decoding as part of the immediate selection fix. |

## 4. Timing and behavior contracts

Every phase must preserve these contracts:

1. Stable scene IDs determine selection. Display sequence numbers never become identity keys.
2. Clicking, hovering, changing selection decoration, or changing label visibility does not mutate video_duration, trim_start, sequence_number, narration timing, overlay timing, or transition duration.
3. Existing scene offsets, frame rounding, narration alignment, transition clamping, and render payload semantics remain authoritative. Do not introduce a second timing model for the new UI.
4. Scene blocks retain their timestamp-derived width and position. Selection does not enlarge horizontal hit rectangles.
5. Transitions remain centered on the incoming scene boundary and above both adjacent scene blocks, including selected blocks and resize handles.
6. Changing zoom changes pixels per second, not seconds. Scene trims/reorders keep transition controls synchronized with the same committed/temporary geometry as scene blocks.
7. Preserve the existing narration/native-audio authority and the preview/export separation that prevents duplicate narration playback.
8. Async results update their originating row by ID and cannot replace another selection or resurrect an empty/deleted selection.
9. Multi-selection remains supported: keep the set of selected items separate from the primary inspector focus. Preserve current modifier semantics initially; any later change to Shift range selection must be explicit.
10. No automatic retries of paid generation/provider operations are introduced by UI reliability work.

## 5. Proposed timeline design

| Element | Recommended default | Expanded/on-demand detail |
|---|---|---|
| V1 identity | Small S1, S2, S3 label | Full scene number, media name, status, timing in inspector |
| Narration | Hidden from the V1 label | Full text in Scene Properties/Scene Board; excerpt on hover/focus |
| Static imagery | One lightweight cached thumbnail per visible scene | Optional denser filmstrip at high zoom if it provides useful detail |
| Video imagery | Cached poster/thumbnail | Optional prepared samples; avoid a live video element in every clip |
| Selected scene | Inset accent outline and modest fill contrast | No horizontal scale or timestamp displacement |
| Transition | Visible boundary control above both clips | Type/duration and edit controls when selected |
| Very narrow clips | Compact mark/status dot when text cannot fit | Hover/focus details; zoom in for precision |
| Status | One small status marker where needed | Full generation/error information in inspector |
| Audio | Distinct narration/music tracks with cached visual display | Real waveforms can follow as a separately measured feature |

Keep labels within clip bounds and decorative elements pointer-events:none. Accessible names should still identify the scene; content must remain reachable with keyboard/focus, not only mouse hover.

A lightweight display menu can offer scene labels, narration excerpts, and thumbnail density later. Default to compact labels. Store display preferences separately from scene content and timing.

Premiere exposes separate toggles for clip names and thumbnails; the useful principle is configurable visual density, not placing a complete script sentence on every clip. [Adobe timeline display guidance](https://helpx.adobe.com/ee/premiere-pro/how-to/working-with-timeline-panel.html).

## 6. Delivery phases and approval checkpoints

The module is split into **eight separately reviewable phases (0–7)**. Phases 0–4 are approved and their local work is delivered. The Phase 0 browser baseline and mounted browser verification remain pending because no browser connection was available. Phases 5–7 await approval. The source audit above is retained as the pre-implementation evidence.

Approval applies only to the phase or phases the user names. Complete the approved scope, report changes and validation, and wait for the next approval before starting an unapproved phase. Every implementation phase includes its own regression checks; Phase 7 adds the full combined verification.

| Phase | Focus | Reviewable result | Approval |
|---|---|---|---|
| 0 | Reproduction and baseline | Local regression baseline/fixtures recorded; browser evidence pending | Approved; browser pending |
| 1 | Reliable scene selection | Fixed hit rectangles, shared selection ownership and ID-derived rows | Implemented; local checks passed |
| 2 | Reliable gestures and transitions | Click thresholds, interruption rollback/cleanup and aligned transitions | Implemented; local checks passed |
| 3 | Save reliability and error recovery | Serialized retained saves, navigation flush and scoped recovery | Implemented; local checks passed |
| 4 | Cleaner timeline design | Compact labels, hover/focus narration details and width-aware marks | Implemented; local checks passed |
| 5 | Rendering and playback efficiency | Less unrelated rendering and stable playback synchronization | Pending |
| 6 | Thumbnails and long-form scaling | Bounded visual assets and viewport-based rendering across tracks | Pending |
| 7 | Combined regression and release checks | Short/long-form results, timing/export comparisons, and remaining limitations | Pending |

### Phase 0 — Reproduce the missed clicks and capture a baseline

**Purpose:** Establish which element or interaction blocks navigation before choosing the final fix.

- Reproduce **5 → 8 → 6 → 7 → 8 → 9**, including center clicks, boundaries, transitions, resize handles, and narrow clips.
- Record browser event targets, active selection kind, gesture state, and event order using development-only traces without script or credential dumps.
- Use the reported project plus fixtures with approximately 25, 100, 250, and 500 scenes. Capture baseline timing and export payload snapshots.
- Measure selection response, rendering work, long tasks, mounted visual counts, and memory. Compare development and production behavior where appropriate.

**Deliverable:** A reproduction report and measurable baseline, with confirmed causes distinguished from unresolved suspects. No intended product behavior change.

**Pass condition:** The browser event path explains the missed clicks, or the remaining possibilities and missing evidence are explicitly documented. Source-extracted probes alone do not close browser reproduction.

**Dependency:** None. Existing source audit and tests are inputs. Browser-dependent work needs a connected browser; report that limitation if unavailable.

### Phase 1 — Make scene selection and inspector ownership reliable

**Purpose:** Ensure the item clicked is the item selected, and background work cannot corrupt that selection.

- Replace horizontal selected-block scaling with an inset outline/shading inside the existing clip rectangle.
- Centralize scene, transition focus, overlay, audio clip, act, and asset selection/clearing. Align background, Escape, and cross-track behavior.
- Preserve multi-selection while separating its item set from the primary inspector focus.
- Match every async completion to its originating ID inside the latest state updater; cover success, failure, generation, bulk actions, and media replacement.
- Move toward stable ID-derived selected rows in bounded steps, preserving editable drafts and temporary-to-persisted ID reconciliation.
- Scope keyboard shortcuts to the editor and respect inputs, select controls, contenteditable elements, and active dialogs.

**Deliverable:** Reliable navigation/highlighting/inspector behavior without moving any timeline timestamps.

**Pass condition:** Repeated ordinary single clicks select the expected scene; competing selections clear; late Scene 7 results cannot modify Scene 8's inspector; selection alone issues no timing writes.

**Dependency:** Phase 0 evidence/baseline. Unresolved browser causes remain visible until verified.

### Phase 2 — Stabilize transition editing, dragging, and resizing

**Purpose:** Prevent simple clicks from becoming edits and interrupted gestures from leaving the editor stuck.

- Initialize transition gesture data on each press and remove stale duration values. A click without movement must not persist a timing change.
- Preserve the transition's layer above both scenes and its exact boundary center.
- Define click versus reorder/resize intent based on browser evidence; use a movement threshold or dedicated grip where required.
- Add transition/overlay cleanup for pointer cancellation, lost capture, unmount, and interruption. Preserve the existing scene resize cancellation support.
- Define cancellation behavior explicitly and keep temporary DOM geometry aligned with the committed scene model.

**Deliverable:** Predictable click, drag, trim, and transition controls with complete cleanup.

**Pass condition:** Bare clicks preserve duration, old handle data cannot reset edits, interrupted gestures leave no active listeners/capture/DOM overrides, and real trims/reorders preserve boundary alignment.

**Dependency:** Phase 1 selection behavior and Phase 0 gesture evidence.

### Phase 3 — Improve save reliability and recover from errors

**Purpose:** Keep edits understandable and failures contained while users continue navigating.

- Retain failed ordinary write payloads, show saving/saved/failed status, and offer intentional retry.
- Flush pending edits before supported in-app route changes. Do not claim browser close/refresh flushing is guaranteed.
- Add scoped inspector recovery and an explicit main preview fallback/retry flow.
- Validate loaded IDs and finite timing values at the editor boundary; handle unavailable/deleted selections safely without silently rewriting source timing.
- Catch event/async errors explicitly. Boundaries complement these checks and do not catch every failure.
- Establish targeted lint for changed editor source despite the current src/** exclusion.

**Deliverable:** Actionable save feedback and usable navigation after a contained preview, inspector, or request failure.

**Pass condition:** Save failure is visible, pending edits are not silently discarded during supported navigation, retries cannot write to another scene, and preview/inspector failure does not remove all navigation controls.

**Dependency:** Phases 1–2 interaction contracts. No paid generation/provider retry policy changes.

### Phase 4 — Simplify the timeline's visual design

**Purpose:** Make the timeline easier to scan while retaining access to narration and metadata.

- Use compact scene labels such as **S7** and remove full narration sentences from the default V1 label.
- Keep full narration in the inspector/Scene Board and provide on-demand hover/focus details.
- Adapt labels to available width, use compact marks for tiny clips, and keep decoration out of pointer handling.
- Preserve fixed selection geometry and transition layering; clarify locked-track feedback.
- Keep display preferences separate from scene content and timing. Optional density controls can follow within explicitly approved scope.

**Deliverable:** A cleaner timeline with accessible scene identity and detailed information on demand.

**Pass condition:** Labels remain readable at useful zoom levels, full information remains accessible, and display changes mutate no narration, scene timing, or export data.

**Dependency:** Phases 1–2. Error-recovery work from Phase 3 remains available.

### Phase 5 — Reduce rendering work and isolate playback updates

Implementation and local validation delivered; browser acceptance pending. See [Phase 5 delivery and measurements](27-phase-5-delivery.md).

**Purpose:** Improve responsiveness without changing the audio clock or seeking rules.

- Extract small memoized SceneBlock/TransitionControl components, then track/inspector boundaries where profiling justifies them.
- Use stable event callbacks and complete dependencies so optimization cannot retain stale selection, locks, durations, or geometry.
- Isolate high-frequency playhead/transport updates from inspector and unrelated track rendering.
- Preserve the native narration authority, active-media switching, synchronization tolerances, duplicate-audio prevention, and end-of-timeline behavior.
- Build shared scene/presentation lookup maps and a stable scene-reference array.
- Measure each change and keep optimizations that demonstrate benefit. Avoid a wholesale editor rewrite.

**Deliverable:** Measured reduction in unrelated rendering during selection, seeking, and playback.

React recommends profiling sluggish interactions before adding memoization. Use [React Profiler](https://react.dev/reference/react/Profiler) and [React memoization guidance](https://react.dev/reference/react/useMemo).

**Pass condition:** Navigation/render costs improve against Phase 0, unrelated inspector work does not recur for every playhead tick, and audio alignment/playback behavior remains unchanged.

**Dependency:** Stable behavior from Phases 1–3 and a measured baseline. Preserve Phase 4's display choices.

### Phase 6 — Bound thumbnails and scale long-form tracks

**Purpose:** Keep visual DOM and media costs tied mainly to visible content rather than total project length.

- Use thumbnail-sized assets and a bounded cache; start with one cached static thumbnail per visible scene.
- Cap filmstrip detail and avoid live per-clip video decoders. Repeated identical URLs do not necessarily cause repeated downloads; measure DOM, decoding, and paint too.
- Extend viewport filtering to rendered overlay/audio clips while retaining full logical data, global overlay lane packing, and required active playback media.
- Preserve existing V1/A1 virtualization and sensible overscan.
- Cache waveform paths. Real amplitude extraction is a separately scoped enhancement rather than an automatic part of this phase.
- Re-measure 250/500-scene fixtures under scrolling, seeking, selection, delayed thumbnails, and repeated use.

**Deliverable:** Bounded mounted visuals, predictable thumbnail costs, and measured long-form navigation improvement.

**Pass condition:** Visual node/cache growth is bounded, offscreen filtering does not change lane assignment or audio playback, and selection remains correct when clips leave/re-enter the viewport.

**Dependency:** Phase 5 component/rendering boundaries and all earlier timing/gesture contracts.

### Phase 7 — Verify the combined editor and report readiness

**Purpose:** Confirm the approved changes work together across short-, medium-, and long-form projects.

- Run the full matrix below in a connected real browser and compare timing/export snapshots with Phase 0.
- Keep the existing selection/transition/layout checks passing and add regressions for every implemented defect.
- Check pending saves, late async results, malformed media/presentation data, interruption recovery, focus, track locks, multi-selection, and prolonged use.
- Run TypeScript and targeted source lint, report measured performance, and document remaining limitations.

**Deliverable:** A readiness report containing passed checks, before/after measurements, timing/export parity, and unresolved issues. Deployment or publication is not included in this phase.

**Pass condition:** The implemented scope meets the agreed functional/performance targets below and has no unresolved regression in timing, narration, selection, or persistence.

**Dependency:** All implementation phases intended for the release. Earlier phases retain their own checks even if later performance/design phases are deferred.

Source-extracted helper tests are useful but cannot replace DOM hit-testing and mounted React interaction tests.

| Area | Required scenarios |
|---|---|
| Scene navigation | 5 → 8 → 6 → 7 → 8 → 9; reverse order; repeat at least 100 cycles; rapid/random clicks; centers and edges at low/default/high zoom |
| Cross-track focus | Overlay → scene → transition → audio clip → act → scene; blank space; Escape; track locks; multi-select toggles |
| Async completion | Start Scene 7 audio/visual work, select Scene 8, clear selection, or delete/reorder the origin before completion; success and failure |
| Gestures | Bare click; tiny movement; intentional drag; pointercancel; lost capture; leaving the window; zoom/scroll during a gesture; unmount |
| Transition state | Change duration, use the other handle, change it in the inspector, then click without dragging; no stale value may be persisted |
| Timing | Exact scene boundaries/frame counts, source trims, overlay attachment, narration/act offsets, transition limits, total duration, and export payload before/after selection and display changes |
| Preview recovery | Missing image/video, invalid presentation data, composition error, unavailable scene row; retain usable navigation and intentional retry |
| Persistence | Delayed/failed save, edits to different scenes, route navigation with a pending debounce, retry of failed ordinary writes; no cross-scene writes |
| Keyboard/accessibility | Input, textarea, select, contenteditable, modal focus, Space/Delete/Escape, focus details, and narrow clips |
| Long form | 250/500 scenes, many overlays/music clips, delayed thumbnails, repeated scroll/seek/select, 10 minutes of use, return to previously unmounted scenes |

Proposed performance goals, measured on a named reference machine/browser with warm data:

- p95 local scene-selection feedback below 100ms; use this as a target, not a claim about current performance.
- Zero missed center clicks in the scripted navigation run and correct primary selection after every ordinary single click.
- Zero scene/timing writes from selection-only operations.
- No recurring navigation-related long tasks above 50ms; isolate media/effect load if the preview has a different bottleneck.
- Mounted clip visuals/thumbnail count bounded by viewport plus overscan and configured detail caps.
- No monotonic growth of gesture listeners, retained media elements, or thumbnail cache during repeated navigation; expect a bounded cache to settle.
- No timing/export regression. Smooth UI and complex preview rendering should be measured separately; do not promise constant 60fps for every effect or device.

## 7. Proposed code boundaries

Begin with bounded fixes in [TimelineEditor.tsx](../src/features/timeline-editor/components/TimelineEditor.tsx) and [tests/timeline-editor](../tests/timeline-editor). Then introduce focused files only when required:

- types.ts: typed editor rows, selection identities, and gesture states.
- hooks/useTimelineSelection.ts: consistent selection and derived current rows.
- hooks/useTimelineGestures.ts: bounded pointer lifecycle and cleanup; retain existing tested geometry helpers.
- components/SceneBlock.tsx and TransitionControl.tsx: precise clip rectangles and boundary controls.
- components/TimelineTracks.tsx and TimelineInspector.tsx: rendering boundaries supported by profiling.
- components/TimelinePreview.tsx: recovery and preview isolation while preserving the playback contract.

Reuse existing [remotion/timeline.ts](../src/remotion/timeline.ts), scene/timeline/overlay server actions, presentation schemas, and render payload code. No database migration is required for compact labels or ID-based selection alone. A global state library, canvas rewrite, timeline engine replacement, or media pipeline migration needs separate evidence and scope.

## 8. Implementation validation

1. Add tests for each confirmed defect before its fix and demonstrate failure against the original behavior.
2. Keep the current 12 selection/transition/layout checks passing.
3. Add mounted React/browser interaction coverage for hit areas, event order, competing selection, cleanup, and late async results.
4. Run TypeScript and targeted lint for changed source. Existing src/** lint exclusion means ordinary lint alone is insufficient.
5. Compare timing and export payload fixtures after each phase; do not broaden the feature work when a regression can be resolved locally.
6. Use explicit catches and request/ID ownership for async errors; React boundaries do not catch event-handler or asynchronous failures. The Remotion Player already contains composition errors and supports a custom fallback/retry flow. [Remotion Player error handling](https://www.remotion.dev/docs/player/player#handling-errors).

## 9. Decisions for the first implementation

- Initial implementation priorities: selection/hit areas, competing focus, and async ownership in Phase 1; transition gesture cleanup/data reuse in Phase 2. Each remains separately approvable.
- Default label: S[number]; default narration excerpt: off.
- Selected block: fixed geometry with inset outline.
- Timing: preserve the existing scene/narration model and frame layout.
- Thumbnails: one cached static thumbnail initially; denser detail must justify its cost.
- Architecture: gradual component/hook extraction after correctness, guided by measurements.
- Completion claim: tested core workflows and measured improvement, not a promise that every future input/effect can never fail.
