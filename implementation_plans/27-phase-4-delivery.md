# Phase 4 — Cleaner timeline display

Approved and implemented on 2026-10-08.

Scene blocks on V1 and per-scene A1 now show compact S1/S7-style labels. Narration is removed from those default labels and remains in the inspector, Scene Board, stored scene data and export inputs. Narrow clips use centered marks; media icons and staged-preview marks appear only when they fit. Awaiting-visuals text appears only at widths that can accommodate it. Labels and detail overlays ignore pointer events.

Hover or keyboard focus shows one viewport-contained detail panel with scene number, track, start time, duration, visual generation status, narration and lock guidance. Narration previews are visually capped at six lines; full text stays available in Scene Info. Details close during pointer interaction, scroll, resize, window blur, zoom and scene trims/reorders, and stay below context menus/export dialogs.

Both scene tracks support Tab focus and Enter/Space selection using the existing selection handler. Inset focus/highlight decoration preserves hit rectangles; locked scenes expose their identity/details while preventing activation. Transition layering, clip widths/offsets and timing actions are unchanged.

No density preference menu or thumbnail/playback optimization was introduced. Those changes need their own approved scope and measurements.

Validation: 47 timeline/shared-layout tests passed, including compact/narrow label rendering and locked/unlocked keyboard selection on both scene tracks. TypeScript, targeted source/test lint and scoped diff whitespace checks passed. The original timing fixtures and transition geometry checks remain passing.

Browser inventory again returned no enabled apps/browsers. Real-browser visual review, actual pointer hit-testing and performance measurements remain pending; no measured responsiveness improvement is claimed.

Phases 5–7 remain pending approval. The unfinished Phase 0 browser baseline is still needed before measured performance comparisons.
