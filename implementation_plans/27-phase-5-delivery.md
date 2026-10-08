# 27 — Phase 5 delivery

Date: 2026-10-08 (Asia/Manila)

Status: Phase 5 implementation and local checks complete. Browser performance/audio acceptance remains pending because the browser connection returned no available browsers or apps. Phases 6–7 have not been started.

## What changed

- Playback now updates the playhead transforms and synchronizes media directly. Ordinary animation frames no longer update the editor's React state, so they no longer re-run the inspector, track trees, presentation panel or other editor UI. Play/pause, selection, edits and failures still use React state normally.
- Extracted memoized SceneBlock visual content and TransitionControl. Unchanged scene thumbnails, labels and A1 visual content retain equal primitive props during selection; transitions use stable callbacks that read the latest committed scene, lock and geometry state. The scene hit targets stay in the editor with fresh handlers. Removed the older track memo wrappers with incomplete dependencies, including missing reorder insertion geometry.
- Added shared scene/presentation indexes and one memoized scene-reference array for composition, validation and the presentation inspector. Legacy duplicate presentation rows retain the old first-match behavior.
- Zoom now preserves the playhead's time in seconds. An explicit seek uses the existing paused-seek tolerance instead of being mistaken for ordinary master-clock jitter. Normal playback tolerances remain unchanged: master 2 seconds, other native media 0.3 seconds, paused seeks 0.1 seconds, Player correction beyond 5 frames.
- The native narration is still the master clock, including act switching and source trims. Metadata/seeking guards, source-duration bounds, track mute/volume, end-of-content stopping and preview isolation remain in place. The existing preview/export narration separation remains intact.

## Measurements and limits

The operation-count harness executes the actual extracted before/after editor declarations and playback implementation. The baseline is the local Phase 4 source captured immediately before Phase 5 edits, SHA-256: 5d2a792aab1bd8d1ef782c7870f731420fd68a893c54fe2a6bd45d6dd5a0d84a.

For 600 synthetic playback frames, the old loop called the editor state setter 600 times. The new loop called it zero times and performed 600 direct synchronization passes. This measures scheduled work, not actual React commits or browser frame time.

For a full composition and presentation-validation rebuild, with one presentation per scene:

| Scenes | Presentation row-ID reads, before → after | Reference arrays, before → after | Reference objects, before → after |
|---|---:|---:|---:|
| 25 | 650 → 75 | 50 → 1 | 1,250 → 25 |
| 100 | 10,100 → 300 | 200 → 1 | 20,000 → 100 |
| 250 | 62,750 → 750 | 500 → 1 | 125,000 → 250 |
| 500 | 250,500 → 1,500 | 1,000 → 1 | 500,000 → 500 |

Selection checks verify shallow-equal props at the actual React.memo boundaries for unchanged scenes and transitions. They do not claim mounted-browser render counts.

Raw results: [operation counts](27-phase-5-operation-counts.json).

Run current-source counts with:

~~~sh
node scripts/timeline/profile-render-work.mjs
~~~

An optional path argument accepts a pre-Phase-5 TimelineEditor.tsx snapshot for comparison. No browser FPS, p95 navigation latency, long-task, media-decoding or memory improvement is claimed. The Phase 0 live-browser baseline and Phase 5 browser pass condition are still open. Further track/inspector splitting should follow those measurements; the per-frame media scan is deliberately retained.

## Verification

- Combined timeline and presentation regressions: **145 passed** with test concurrency 1. The initial unrestricted parallel run exhausted worker memory; the sequential rerun passed.
- TypeScript: **passed**.
- Targeted timeline source and test/script lint: **passed**.
- Regression coverage includes native versus fallback clock, act boundaries, explicit/paused seeks, metadata guards, mute/volume, preview isolation/failure, exact end stop, cancellation, playhead reattachment, zoom time preservation, transition positioning/click/drop/resize, fresh locks/geometry, and shared references.
- Existing timeline geometry, async selection, save queue, recovery and presentation/export checks remain passing.

## Browser acceptance still required

Use short and long projects to check selection 5 → 8 → 6 → 7 → 8 → 9, transition selection/resize, play/pause and small/large seeks, zoom during playback, crossing act boundaries, preview retry/isolation, and the final content boundary. Record React Profiler commits and browser interaction/long-task timing against the Phase 0 baseline. Confirm narration by listening, including no doubled audio.

Phase 6 remains the next separate scope: thumbnail/waveform work and additional track virtualization. No media decoding, thumbnail count, waveform algorithm, database schema, generation, or export contract was changed here.
