# 27 — Phase 6 delivery

Date: 2026-10-09 (Asia/Manila)

Status: Phase 6 implementation and local checks complete. Browser scrolling, media loading, gesture and audio acceptance remain pending: the browser connection returned no available browsers or apps. Phase 7 has not been started.

## What changed

- Visible image scenes now use one static 160×90 thumbnail instead of repeated original-image elements. A per-editor cache deduplicates sources, limits work to two concurrent loads, and caps retained entries at 128 and estimated thumbnail storage at 8 MiB. Eviction and editor cleanup revoke object URLs; cancelled or replaced requests cannot insert stale results. Missing or CORS-blocked sources keep a lightweight placeholder. Video scenes retain their existing placeholder without introducing per-clip video decoders.
- Overlay and custom V1/A1/A2 clip visuals now render only within the viewport plus 1,600px overscan. Narrated and unrecorded act blocks use the same visibility rule. Active overlay gestures and custom audio trim/drag operations retain their visual while offscreen. Scene visibility checks both V1 and A1 positions so independent reorder spacing cannot hide an otherwise visible scene.
- Overlay lanes still derive from the complete clip set before filtering. Selection IDs, track-wide selection, timing data, snapping and the hidden native playback media still use full logical data. Offscreen audio remains available to playback.
- Decorative waveform paths are reused instead of rebuilding trigonometric samples during rendering. Act-specific variants use a 32-entry cache. The audio track hints identify these patterns as decorative; real amplitude extraction remains separately scoped.

Scene timestamps, narration alignment, transition geometry, persistence payloads and export contracts were not changed. No database or dependency changes were needed.

## Measurements and limits

The repeatable harness compares actual SceneBlock server-rendered output and visibility helpers against pre-Phase-6 commit `02a6fbd`. Fixtures contain 250 or 500 five-second scenes with matching overlay/music clips, a 1,200px viewport, three scroll passes and 33 sampled windows at each zoom. Both project sizes produced these peak counts:

| Zoom (pixels/second) | Scene image elements before → thumbnail slots after | Overlay/music visuals before → after, per clip collection |
|---|---:|---:|
| 10 | 90 → 90 | 250 or 500 → 90 |
| 30 | 62 → 31 | 250 or 500 → 31 |
| 100 | 70 → 10 | 250 or 500 → 10 |

The cache probe uses delayed synthetic 60,000-byte thumbnails. It stayed at or below 128 retained entries, 7,680,000 estimated bytes and two concurrent loads; clearing it left zero entries and bytes. Separate tests exercise cancellation, failure, eviction, oversized results, repeat use and the real browser loader's resize/disposal contract using browser API substitutes.

Raw results: [operation counts](27-phase-6-operation-counts.json).

~~~sh
node scripts/timeline/profile-visual-work.mjs
~~~

An optional Git revision argument selects another baseline. These are structural work counts, not browser FPS, React commits, decoded browser memory or measured click latency. Mounted counts depend on visible density and overscan; overlapping clips can still produce many visible elements.

On a cache miss the browser still downloads and decodes the original source once before creating the small thumbnail. The storage estimate includes the retained encoded thumbnail plus its RGBA dimensions; it does not bound transient original-image decoding or total browser memory. CORS restrictions can prevent thumbnail creation even where a plain image tag could display the source. Failed entries do not automatically retry while cached. If more sources are simultaneously visible than the cache budget allows, evicted visuals show placeholders until remounted. Prepared server-side thumbnails and video posters remain possible follow-up work.

## Verification

- Combined timeline and presentation regressions: **160 passed**, zero failures, with test concurrency 1.
- TypeScript: **passed**.
- Targeted timeline source, tests and scripts lint: **passed**.
- Checks cover 250/500-clip repeated scrolling at low/default/high zoom, stable IDs and times after re-entry, global lane assignment, offscreen gesture retention, independent A1 reorder visibility, cache cleanup and stale completions, unchanged waveform appearance, and offscreen audio in the actual playback element tree.
- Existing scene selection, transition positioning, cancellation, save recovery, playback and presentation/export regressions remain passing.

## Browser acceptance still required

Use short and 250/500-scene projects to repeat selection 5 → 8 → 6 → 7 → 8 → 9, scroll away and back, seek/play across acts and music clips, change zoom, and scroll during overlay/audio trims and native drags. Confirm lane positions, selection highlighting, thumbnail loading/failure, transition hit targets and unchanged narration by listening. Repeat for at least ten minutes while observing DOM count, object URL retention, browser memory and interaction timing.

Phase 7 is the remaining separately approved scope: combined browser regression, timing/export comparison and readiness reporting. Until the browser checks run, smoothness and audio acceptance remain unverified.
