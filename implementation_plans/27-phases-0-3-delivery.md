# Timeline reliability — Phases 0–3 delivery

Approved scope: Phases 0–3 on 2026-10-08. Phases 4–7 remain pending approval.

## Phase 0

Recorded the original 12 passing tests and confirmed source-level defect probes. Added deterministic 25/100/250/500-scene timing fixtures and opt-in development event tracing. See [baseline and browser trace instructions](27-phase-0-baseline.md).

Browser reproduction remains pending: the computer-use inventory returned no enabled browsers/apps. No actual click-hit trace, mounted React interaction run, production export request snapshot, selection latency, long-task or memory measurement is claimed.

## Phase 1

Removed horizontal selection scaling and use inset scene highlighting. Added shared selection ownership for scenes, transitions, overlays, audio clips, acts and assets; blank-space/Escape clearing and multi-selection remain consistent. Selected scenes/audio clips store IDs and derive the current row. Temporary IDs reconcile to persisted IDs. Guarded late audio/visual results by origin ID and scoped keyboard handling to the editor, editable fields and dialogs. Clip clicks explicitly give the editor keyboard focus.

Additional regression review fixed A1 custom audio deletion being confused with scene narration, respected track locks, and prevented a declined scene deletion from affecting accompanying audio. Stock request ordering and completion of staged picks no longer erase newer scene work; late combo completion cannot seek away from another selected scene.

## Phase 2

Transition gestures use fresh local values rather than persistent handle datasets. Bare clicks and tiny motion do not persist timing edits. Transition controls remain siblings above neighboring clips and centered on the incoming boundary. Scene/audio trims preserve their existing DOM geometry contract and consume the final pointer sample.

Shared overlay/transition gesture lifecycle owns a single pointer and cleans up on pointer cancellation, lost capture, Escape, blur, scroll, resize and unmount. Cancellation restores original edited values; completion saves once. Zoom cancels active gestures before changing scale. Native scene reordering keeps its current algorithm with an intentional movement threshold.

## Phase 3

Ordinary update saves are serialized per entity, merge newer fields and retain failed payloads. Header status and a failure banner expose saving/saved/failed state with intentional retry. Queue covers scenes, audio clips, overlays (including canonical card content), track settings, captions and generation defaults. Paid generation/provider work is not automatically retried.

Internal editor Links (workspace/video tabs) and Scene Board actions await pending updates. Failed saves block those route changes. New uploads/clip creation must finish first. Export also waits for ordinary edits. Browser refresh/close only receives the standard pending-work warning; native history navigation and browser shutdown cannot guarantee flushing. Failed drafts survive only in the current mounted editor session, not reloads.

Loaded identities and finite timing are validated before mounting the editor; invalid rows present reload/workspace recovery without rewriting timing. The inspector evaluates its panel inside a scoped boundary; selection changes or manual retry recover it. Main Player has explicit fallback/retry, pauses playback on error and restores synchronization on retry. User-triggered async failures are caught and shown; boundaries do not replace event/request catches.

An independent source lint gate covers the changed editor despite the repository's global src/** exclusion. The legacy editor retains existing any/unused-variable exemptions; new reliability modules have stricter checks. Commands: npm run test:timeline, npm run lint:timeline, npm run typecheck.

## Validation and remaining work

- 43 timeline/shared-layout regression checks pass.
- Combined timeline and presentation suite: 126 passed, zero failures.
- TypeScript and targeted source/test lint pass.
- Scoped git diff whitespace check passes.
- Existing layout engine, per-scene frame rounding, scene timing and narration/native-audio clock remain authoritative. Tests cover all six transition modes, zoom-dependent geometry, 100 repeated source-handler navigation cycles, late audio ownership, multi-selection, cancellations, stock races, save failures/retry/navigation and malformed data.
- These are source-executed/unit regressions, not real DOM hit-testing or mounted React/browser verification. Live error fallback/retry, production export parity, perceived smoothness, drag thresholds and long-form performance still require a connected browser. The Phase 0 browser baseline is explicitly unfinished.

Labels, filmstrip density, playback render isolation and broader virtualization were not implemented; they belong to unapproved Phases 4–7. No deployment or database migration was performed.
