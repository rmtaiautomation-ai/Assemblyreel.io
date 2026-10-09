# 27 — Phase 7 readiness report

Date: 2026-10-09 (Asia/Manila)

**Local verification passed. Phase 7 remains open for live-browser acceptance.** No enabled browser or app was returned by the browser inventory during this phase. The original missed-click sequence has therefore not been verified through actual browser hit targets, and release readiness is not yet established.

## Delivered in this phase

- Added a fixed export/timing reference from historical revision `5c9753c`, before the timeline stability work. It extends the Phase 0 synthetic duration fixtures with all six transition modes, clamped transitions, source trims, narration, music, overlays and captions. The 24 cases cover 25/100/250/500 scenes at 24/30/60 fps with master or act narration. Current serialized prepared payloads and shared frame layouts match that reference.
- Combined the actual selection handler and viewport filtering with export comparisons. Each case runs the reported selection sequence and its reverse for 100 cycles at three zoom scales: 72,000 handler calls overall. Scene rows, frame layouts and prepared export payloads remain unchanged. Full offscreen audio and overlay data remain in export; the preview still excludes duplicate narration/audio.
- Tested the actual export handler with mocked I/O: it waits for pending saves and issues no request when saving or presentation validation fails.
- Reproduced and fixed an export recovery bug. If submission failed and the subsequent project-status request also rejected, the outer handler could leave `isRendering` true. It now stops polling, clears the local busy state and reports the error even when status persistence is unavailable. No automatic render retry was added.
- Added `npm run test:timeline:release` for the combined timeline/presentation suite with one test worker, avoiding the earlier parallel-worker memory exhaustion.

No real export jobs, generation requests, database migrations, publication or deployment were performed.

## Local results

| Gate | Result | Evidence and scope |
|---|---|---|
| Combined regressions | 166 passed; zero failed or skipped | Timeline and presentation tests, including server actions with controlled I/O |
| TypeScript | Passed | `tsc --noEmit` |
| Targeted source/test/script lint | Passed | Independent timeline configuration; includes the editor despite global source ignores |
| Timing and export fixture parity | 24/24 cases passed | Historical reference versus current serialized payloads and frame layouts |
| Repeated selection/display changes | Passed locally | 72,000 source-handler calls; no timing or export changes |
| Diff whitespace | Passed | Scoped working-tree patch check |

Machine-readable results: [verification record](27-phase-7-verification.json). Fixed expected values: [export baseline](../tests/timeline-editor/export-baseline.json). Tests: [export readiness](../tests/timeline-editor/export-readiness.test.mjs).

Re-run the local gates:

~~~sh
npm run test:timeline:release
npm run typecheck
npm run lint:timeline
node node_modules/eslint/bin/eslint.js --config eslint.timeline.config.mjs tests/timeline-editor scripts/timeline
git diff --check
~~~

The historical reference can be independently reproduced with `node scripts/timeline/capture-export-baseline.mjs 5c9753c`. That script only prints results; ordinary tests read the fixed reference and never regenerate expected values. JSON comparisons represent serialized payloads, where undefined optional properties are omitted. Fixtures contain no attached presentations; the separate presentation regression suite covers their saved resolution, ownership, versions, assets and export behavior.

This is a comparison against historical source with synthetic fixtures, not a captured production export request or a real encoded output comparison. Source-extracted handlers, server rendering, mock media objects and substituted browser APIs do not establish mounted React event ordering, audible sync or browser performance.

## Combined coverage and remaining browser work

| Area | Automated evidence | Live acceptance still needed |
|---|---|---|
| Scene navigation | Repeated forward/reverse selection, current ID-derived rows, async origin ownership, no enlarged selection geometry | 5 → 8 → 6 → 7 → 8 → 9 at centers and edges, random rapid clicks, low/default/high zoom; zero missed center clicks |
| Focus and accessibility | Cross-kind focus clearing, multi-select, track locks, input/dialog shortcut guards, compact label markup | Real tab order, focus details, keyboard ownership and blank-space/Escape behavior |
| Transitions and gestures | Sibling layer/center geometry, no writes on bare clicks, final samples, cancellation and cleanup | Actual hit targets, tiny versus intentional drags, scroll/zoom/blur/lost capture during edits |
| Persistence and async work | Retained failed drafts, serialized writes, retries, navigation flush, stock races and late completions | Delayed/failed requests while changing selection and navigating through the app |
| Recovery | Malformed input guards, async failures and export submission/status failure | Mounted inspector/Player failure and retry, missing/deleted scene or media |
| Audio and preview | Clock authority, act boundaries, trims, mute/volume, seeking guards, exact stopping and preview isolation | Listen for synchronization and doubled audio during seeks, zoom, act changes and recovery |
| Long-form visuals | 250/500-item filtering/re-entry, global overlay lanes, bounded cache, delayed loads and disposal | Delayed real thumbnails and CORS failures, ten-minute scroll/seek/select session, DOM/URL/memory observations |
| Timing and export | Shared engine unchanged; 24 prepared payload/layout comparisons; presentation export regressions | Capture actual request inputs and compare rendered output on representative projects |
| Performance | Phase 5/6 structural operation counts | Named browser/machine baseline, p95 selection latency, React commits, long tasks, decoding and paint |

## Performance evidence and practical limits

The [Phase 5 counts](27-phase-5-operation-counts.json) show 600 simulated playback frames moving from 600 scheduled editor state updates to zero. Shared presentation/reference indexes reduce repeated lookup work. The [Phase 6 counts](27-phase-6-operation-counts.json) show default-zoom thumbnail slots moving from 62 to 31 and high-zoom slots from 70 to 10. Overlay/music fixtures drop from 250/500 mounted visuals per collection to 31 at default zoom. These are work counts, not measured React commits, latency or FPS.

The thumbnail cache retains at most 128 entries and 8 MiB of estimated thumbnail storage with two loads at once. Initial source downloads and full-image decoding still occur on cache misses; the budget does not cap total browser memory. Many overlapping visible clips can still produce a dense DOM. Native playback media remain mounted across the project, so this phase does not claim total audio-element count or the per-frame media scan is bounded by the viewport. Decorative waveforms are not measured audio amplitudes.

Existing save limitations remain: pending failed drafts live in the mounted session; native history navigation and browser shutdown cannot guarantee flushing. If render-status persistence fails, the local export UI recovers but the server's stored status may still need reconciliation after connectivity returns.

## Completion checkpoint

All local gates are green and the additional confirmed recovery defect is fixed. Finish the browser matrix above with the editor connected, record the ten-minute short/long-form results and timing observations, and resolve any browser failures before marking Phase 7 complete. No further feature phase is waiting for approval; the remaining work is acceptance verification for this phase.
