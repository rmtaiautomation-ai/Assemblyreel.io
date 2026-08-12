# 12 Overlay Track: Independent Text Clips + Drag-to-Position + Kinetic Presets

## Goal Description
Today a scene can carry exactly one text overlay (`overlay_text`/`overlay_preset`/`overlay_color`
on the scene row), rendered with one of 4 simple presets (Slide In, Pop In, Typewriter, Lower
Third) that are each just one `interpolate()`/`spring()` call — no per-word stagger, no masking,
no background dimming, and no way to have more than one overlay live at once. This plan adds a
genuinely new, independent **overlay track** — a text overlay becomes its own clip with its own
timing and its own screen position, decoupled from which scene(s) happen to be playing underneath
it, the way Premiere/Final Cut/DaVinci/CapCut all handle text. It also adds 4 new, substantially
more sophisticated "kinetic typography" presets, and free drag-to-position on the live preview.

## Decisions Already Aligned With The User (do not re-litigate)
- **Independent overlay track, not scene-scoped multi-overlay.** A text overlay's timing is its
  own — it is not tied to which scene(s) it happens to sit over. This supersedes an earlier,
  smaller version of this plan that considered just letting a scene hold an array of overlays;
  that model still caps overlay timing to a single scene's duration, which doesn't fit the actual
  need (a title that spans across a cut, or three overlays stacked with independent timing).
- **Free drag-to-position on the live preview**, not a top/center/bottom enum. Position is stored
  as `xPercent`/`yPercent` (0-100, resolution-independent across 16:9/9:16/1:1), settable either
  by dragging the text directly on the `<Player>` preview or via quick preset buttons
  (Top/Center/Bottom/Left/Right) for speed.
- **The track and drag-positioning ship together**, not sequenced as track-first-position-later.
- **Automatic CapCut-style lane-stacking** when two overlay clips overlap in time — the track is a
  group (OV1, OV2, OV3…) that expands/collapses automatically based on time-overlap, computed live
  from each clip's own `start_time`/`duration` at render time, never persisted as a `lane` column.
  No hard cap on lane count for this pass.
- **4 new kinetic presets**, chosen after explicit research into what "professional" (not
  swipe-left/swipe-right "toy") title treatments look like in real motion-graphics work:
  - **Cinematic Reveal** — per-word stagger: `translateY` + `opacity` + `filter: blur()` together,
    each word going from blurred/low/offset to sharp/full/settled. The most common "premium"
    kinetic-title look (Apple-keynote-style openers, most high-end creator intros).
  - **Line Wipe** — headline revealed by an animated `clip-path` sweep, left→right, with a thin
    leading accent bar. The "expensive documentary title card" look.
  - **Letter Collapse** — individual characters converge inward from a spread-out start via
    `spring()`, landing with a slight overshoot-settle. Best for a short word or two; movie-trailer
    energy. Intended for short text — not enforced in code, just a usage note on the component.
  - **Chapter Card** — a small kicker label (e.g. "CHAPTER 02") fades/rises in first, then the main
    headline follows using the same word-stagger technique as Cinematic Reveal. Directly maps to
    the "roadmap/section break" use case that prompted this whole plan.
- **Dim Background** ships as its own checkbox, independent of which preset is chosen, usable on
  any overlay clip (old or new preset) — a flat `rgba(0,0,0,0.45)` scrim between the media and the
  text, fading in/out over the same 0.3s edges every preset already uses for its own exit.
- **No new npm dependencies.** Every technique here (word/char splitting, `clip-path`,
  `filter: blur()`, springs) is achievable with plain CSS + Remotion's existing `interpolate`/
  `spring` — confirmed nothing like `@remotion/paths` or `@remotion/shapes` is installed or needed.
- **The old scene-scoped `SceneOverlay` system is left alone** — not migrated, not removed. It
  keeps working exactly as it does today for the simple "one label on one scene" case. The new
  track is purely additive.
- **Explicitly, deliberately out of scope for this plan**: designed graphic-card templates (e.g. a
  checklist card with its own background panel + icon list, or a title card combining a background
  image with a foreground cutout/transparent-PNG image, referenced by the user against real
  examples during planning). These are a fundamentally different kind of thing — fixed custom
  layouts with their own data shape (an array of bullet items, an image URL) rather than
  text + motion — and will get their own plan once this track exists for them to slot into.

## Proposed Changes

### 1. Database — `db/create-overlay-clips.sql` (new)
Own table, not `timeline_items` — that table's `media_id` is a required FK (every A1/A2 clip is a
real media file), and a text overlay isn't a media asset, just config. Manual-run convention, same
as every other `db/create-*`/`add-*.sql` in this repo:
```sql
create table public.overlay_clips (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.video_projects(id) on delete cascade not null,
  text text not null,
  kicker_text text,
  preset text not null,
  color text not null default '#FFFFFF',
  font_size numeric,
  x_percent numeric not null default 50,
  y_percent numeric not null default 50,
  dim_background boolean not null default false,
  start_time numeric not null default 0,
  duration numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### 2. Server actions — `src/app/actions/overlay-clip-actions.ts` (new)
CRUD mirroring the shape of `src/app/actions/timeline-actions.ts`
(`createTimelineItem`/`updateTimelineItem`/`deleteTimelineItem`): `createOverlayClip`,
`updateOverlayClip`, `deleteOverlayClip`, each project/RLS-scoped the same way.

### 3. Render-facing types — `src/remotion/types.ts`
- Extend `OverlayPreset` with `'cinematic-reveal' | 'line-wipe' | 'letter-collapse' |
  'chapter-card'`.
- New `OverlayClipData` shape (id, text, kickerText, preset, color, fontSize, xPercent, yPercent,
  dimBackground, startInSeconds, durationInSeconds) added to `VideoCompositionProps` as
  `overlayClips?: OverlayClipData[]` — named distinctly from the existing `CompositionAudioClip[]`
  `audioClips` field it sits alongside.

### 4. Shared kinetic-text utilities — `src/remotion/overlays/kinetic-utils.ts` (new)
- `splitWords(text: string): string[]`
- `staggerProgress(frame, index, staggerFrames, riseFrames): number` — clamped 0→1 ramp for item
  `index`, shifted later by `index * staggerFrames`. Shared by Cinematic Reveal, Letter Collapse,
  and Chapter Card's headline (via Cinematic Reveal's own technique) rather than each hand-rolling
  the same stagger math.

### 5. Four new preset components — `src/remotion/overlays/` (new files)
`CinematicReveal.tsx`, `LineWipe.tsx`, `LetterCollapse.tsx`, `ChapterCard.tsx` — same prop shape
the existing 4 presets use (`{ text, color, fontSize, durationInFrames }`, `ChapterCard` also takes
`kickerText`), same 0.3s fade-out-on-exit convention as every existing preset, for one consistent
feel across all 8.

### 6. Positioning refactor — existing preset components
`SlideIn.tsx`, `PopIn.tsx`, `Typewriter.tsx`, `LowerThird.tsx` currently self-center via
`AbsoluteFill` + `justifyContent`/`alignItems: center`. Move positioning OUT of every preset
(existing and new) and into one shared wrapper applying `left: {x}%, top: {y}%` +
`transform: translate(-50%,-50%)`, driven by the clip's own `xPercent`/`yPercent`. Small, targeted
edit to each file — presets keep their existing animation logic untouched, they just stop owning
their own placement. This is what makes free drag-to-position possible at all.

### 7. Composition rendering — `src/remotion/compositions/VideoComposition.tsx`
- Overlay clips render as their own top-level layer, **after** all scene `<Sequence>`s — same
  reasoning `CaptionTrack` already uses for painting above everything (a caption/title hidden
  behind a scene transition would be worse than none at all).
- Each clip is its own `<Sequence from={startFrame} durationInFrames={durationFrames}>` wrapping
  the positioning wrapper (§6) around the chosen preset (§5/existing).
- Dim Background scrim rendered per-clip, sized to that clip's own duration — independent of scene
  boundaries, unlike the (unrelated, untouched) scene-scoped overlay's own scrim-less rendering.

### 8. Timeline UI — `src/components/ui/TimelineEditor.tsx`
- **New "OV" track**, rendered above V1 (topmost = overlays, the universal V2-above-V1 convention
  in every professional NLE). Reuses the exact `<Rnd>` drag/trim/resize pattern already built for
  A1/A2 clips (`TimelineEditor.tsx`, the A2 `<Rnd>` block) — new local `OverlayClip` type, no
  `asset`/`assetId` since no media file is involved.
- **Automatic lane-stacking**: sort clips by `start_time`, greedily assign each to the first lane
  whose last-placed clip already ends before this one starts (interval-scheduling lane packing,
  the same idea calendar UIs use to stack overlapping events into side-by-side columns). Purely a
  rendering-time layout computation — no `lane` column, so trimming/moving a clip so it no longer
  overlaps anything automatically re-packs everything with nothing to keep in sync.
- **"+ Add Text" affordance** to create a new overlay clip directly (there's no draggable "asset"
  for a blank text clip the way there is for Media-panel audio/video, so this is a button that
  creates a default clip rather than a drag-from-library interaction).
- **Overlay clip properties panel**: Text, Kicker Text (only shown when preset is Chapter Card),
  Animation dropdown (all 8 presets — 4 existing + 4 new), Color, Dim Background checkbox, Position
  (drag-on-preview + quick preset buttons). Scoped to the selected overlay clip, not
  `selectedScene` — likely its own panel state, swapping into the same right-panel real estate the
  way the A2-clip-selected state already swaps Scene Properties for clip properties today.
- **Drag-to-position layer over `<Player>`** (`TimelineEditor.tsx`, currently a bare
  `<div className="absolute inset-0">` with nothing interactive over it): a new transparent layer,
  visible only when an overlay clip is selected, reading pointer position relative to the Player's
  `getBoundingClientRect()`, converting to `xPercent`/`yPercent`, writing live to the selected clip
  so what's seen while dragging is the real final position. Includes center-horizontal/
  center-vertical/safe-margin snapping while dragging.

## Risks / Things To Verify During Implementation
1. **Lane-packing correctness** — verify the greedy interval-scheduling assignment behaves
   correctly (and doesn't flicker/reassign lanes unexpectedly) while a clip is actively being
   dragged mid-gesture, not just once the drag ends.
2. **Player-rect-to-percent mapping** — the drag layer's coordinate math must stay correct across
   all 3 aspect ratios (16:9/9:16/1:1) and as the browser window resizes; needs a manual check in
   each ratio, not just the default.
3. **Positioning refactor blast radius** — confirm removing self-centering from the 4 EXISTING
   presets doesn't visually regress the old scene-scoped overlay feature, which still uses those
   same components unchanged; the scene-scoped path needs to keep defaulting to center position
   after the refactor.
4. **Rendering determinism** — confirm no new component accidentally introduces non-frame-driven
   timing (e.g. `Math.random()`, real-clock reads) that would break deterministic re-renders.

## Explicitly Out Of Scope (this pass)
- Migrating or removing the old scene-scoped `SceneOverlay` system.
- Rotation/scale handles on overlay clips — position only (X/Y drag), no resize-by-corner-drag.
- Overlay clips referencing external images/logos — text only, for now.
- Designed graphic-card templates (checklist card, title+cutout-image, etc.) — a different feature,
  deferred to its own future plan.
- A hard cap on simultaneous overlay lanes.

## Critical Files
- `db/create-overlay-clips.sql` (new)
- `src/app/actions/overlay-clip-actions.ts` (new)
- `src/remotion/types.ts`
- `src/remotion/overlays/kinetic-utils.ts` (new)
- `src/remotion/overlays/CinematicReveal.tsx` (new)
- `src/remotion/overlays/LineWipe.tsx` (new)
- `src/remotion/overlays/LetterCollapse.tsx` (new)
- `src/remotion/overlays/ChapterCard.tsx` (new)
- `src/remotion/overlays/SlideIn.tsx`, `PopIn.tsx`, `Typewriter.tsx`, `LowerThird.tsx` (positioning refactor)
- `src/remotion/compositions/VideoComposition.tsx`
- `src/components/ui/TimelineEditor.tsx`
