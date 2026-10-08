# Phase 0 baseline — 2026-10-08

Phases 0–3 are approved. Existing scene-update, transition-layer and presentation timeline checks: 12 passed before changes.

Confirmed source probes: selected 600px clip grows to 642px (21px overlap on each side); scene selection leaves overlay focus active; Scene 7 audio completion overwrites the selected Scene 8 copy; stale transition handle data persists a duration on a bare click.

Added deterministic 25/100/250/500-scene fixtures checking original payload immutability, per-scene rounding, exact nominal frame boundaries and total frames. These protect the existing shared layout engine. They are not captured production export requests or browser performance measurements.

Browser inventory returned no enabled browsers or apps. Actual hit targets/event order, mounted React clicks, selection latency, long tasks, DOM/memory counts and development/production comparison remain unmeasured. The reported 5 → 8 → 6 → 7 → 8 → 9 sequence still needs real browser verification at centers, edges and different zoom levels. No latency or performance improvement is claimed from source probes.

Proceed with independently confirmed correctness fixes; retain this browser verification gap through subsequent phase reports.

Opt-in development browser traces are now available. In the application developer console, set `localStorage.setItem("timeline:debug-navigation", "1")` and repeat the reported sequence. Pointer/click traces report target tag, scene/transition IDs, prior selection, active gesture kind and event time; no narration, URLs or credentials are logged. Disable with `localStorage.removeItem("timeline:debug-navigation")`. These traces have not yet been captured in a connected browser.
