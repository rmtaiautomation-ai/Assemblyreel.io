# 11 Ken Burns Pan & Zoom Effect for Image Scenes

## Goal Description
Image scenes currently render as a completely static frame for their whole on-screen duration. Add an opt-in "Ken Burns effect" — a slow pan and/or zoom applied to a static image over the time it's visible — so image scenes don't look frozen. This follows the same end-to-end pattern already used for scene transitions (`implementation_plans/05-timeline-scene-management.md`), touching the DB schema, the server action write-allowlist, the Remotion render-facing type, the editor's scene-mapping, the composition renderer, and the Scene Info settings panel.

## Decisions Already Aligned With The User (do not re-litigate)
- **Opt-in, off by default.** Not automatic for every image scene — a per-scene toggle the user turns on.
- **Motion is randomly chosen per scene, not AI-decided from image content.** We explicitly considered having a vision model pick the pan direction based on what's in the image (e.g. zoom toward a face, pan away from empty sky) and decided **against it for this pass**: it adds an API call per image scene, extra generation-pipeline latency, and a new failure mode, for a cosmetic feature where random rarely looks *wrong*. If random selection turns out to look bad often in practice, a follow-up plan can add AI-based direction selection as a v2 — but that is explicitly out of scope here.
- **Deterministic, not truly random.** The chosen motion must be derived from something stable about the scene (its id) so the same scene always animates the same way on every re-render/preview, rather than re-rolling every time.
- **Own dedicated control, not folded into the existing "Transition In" dropdown.** Transition governs movement *between* two scenes (crossfade, slide, cut, etc.); Ken Burns is motion *within* one scene's own image and is logically independent — a scene could have both a transition-in AND Ken Burns active at once (transition plays as it enters, then the pan/zoom continues for the rest of the scene). Mixing them into one control would make that combination inexpressible.
- **UI placement:** lives in the per-scene **Scene Info** panel (the right-hand settings panel opened by clicking a scene on the timeline) — the same panel that already has Voiceover, Visual Generation, Overlay, and Transition sections. Placed **between the Overlay section and the Transition accordion**.
- **UI shape:** a single checkbox row, not a new accordion/dropdown. Overlay and Transition are accordions because they have multiple sub-settings to expand (style, color, duration...); Ken Burns is just one on/off flag with nothing to configure once enabled, so a full accordion would be overkill.
- Only relevant to **image** scenes — hidden/ignored for video scenes, which already have their own motion.

## Proposed Changes

### 1. Database — `db/add-scene-ken-burns.sql` (new)
Single boolean column, matching the manual-run convention of every other `db/add-*.sql` file in this repo (paste into Supabase SQL editor; must run **before** the `UPDATABLE_FIELDS` change ships, or PostgREST will reject the *entire* scene-update payload once the app tries to write an unknown column):
```sql
alter table public.scenes
  add column if not exists ken_burns_enabled boolean not null default false;
```
No variant/direction column — the motion variant is derived deterministically from `scene.id` at render time, not stored, so there's nothing to backfill.

### 2. Server action allowlist — `src/app/actions/scene-actions.ts`
Add `"ken_burns_enabled"` to `UPDATABLE_FIELDS` (~line 22), with the same "requires migration to have run first" comment already used for `transition_type`/`transition_duration`.

### 3. Render-facing type — `src/remotion/types.ts`
Add to `CompositionScene` (after `transition?`, ~line 46):
```ts
/** Opt-in pan/zoom for image scenes. Ignored when mediaType !== 'image'. */
kenBurnsEnabled?: boolean;
```

### 4. Editor scene mapping — `src/components/ui/TimelineEditor.tsx` (`remotionScenes` useMemo, ~line 2076-2098)
Add `kenBurnsEnabled: Boolean(s.ken_burns_enabled),` to the mapped object literal, alongside `transition`.

### 5. New effect component — `src/remotion/effects/KenBurns.tsx`
Mirrors the existing `src/remotion/transitions/SmoothZoom.tsx` style (`interpolate()` + `Easing`, frame-driven `transform`):
- **8 motion variants:** pan left, pan right, pan up, pan down, zoom in, zoom out, and 2 diagonals.
- **Deterministic pick:** a simple string hash (e.g. djb2-style) of `scene.id`, mod the variant count. Same scene id always yields the same variant.
- **No revealed edges:** image pre-scaled to `~1.15x` (roughly 7.5% overscan margin per edge); pan/translate ranges stay safely inside that margin (diagonal variants split the budget across both axes). All math in percentages/unitless `scale()`, so it's aspect-ratio- and resolution-independent (16:9, 9:16, 1:1, 30fps or 60fps all get proportionally identical motion) — no pixel constants.
- Renders `<AbsoluteFill style={{overflow:'hidden'}}>` wrapping an `<Img>` with `objectFit: 'cover'` (unchanged from today) plus the animated `transform`.
- Takes `durationInFrames` as a prop, driven by local `useCurrentFrame()` — valid without any re-anchoring trick since it sits at the same nesting level the plain `<Img>` sits at today.

### 6. Composition renderer — `src/remotion/compositions/VideoComposition.tsx`
In the image-rendering branch (currently ~lines 112-116), when `scene.mediaType === 'image' && scene.kenBurnsEnabled`, render `<KenBurns src={scene.mediaUrl} sceneId={scene.id} durationInFrames={segment.renderDurationInFrames} />` instead of the plain `<Img>`. Use `renderDurationInFrames` (which already includes transition pre-roll), not the nominal-only duration, so motion is already underway the instant a transition finishes revealing the scene rather than snapping mid-motion at the nominal boundary. **Needs a manual visual QA pass** once implemented: confirm a scene with both a transition-in and Ken Burns enabled doesn't look like the pan is "already partway done" when the transition completes. If it reads oddly, the fix is to start `progress` at `transitionInFrames` instead of `0` inside `KenBurns`.

### 7. Scene Info panel UI — `src/components/ui/TimelineEditor.tsx`
Single checkbox row, gated on `selectedScene.custom_media_type !== 'video'`, placed between the Overlay section (ends ~line 3279) and the Transition accordion (starts ~line 3281):
```tsx
{selectedScene.custom_media_type !== 'video' && (
  <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg shadow-sm cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
    <input
      type="checkbox"
      checked={Boolean(selectedScene.ken_burns_enabled)}
      onChange={(e) => updateSceneDetails(selectedScene.id, 'ken_burns_enabled', e.target.checked)}
      className="accent-purple-600"
    />
    <span className="text-xs font-bold text-gray-700">Ken Burns pan &amp; zoom</span>
  </label>
)}
```
No new `useState` needed — unlike Overlay/Transition, there's no expand/collapse state since it's a single persisted boolean, not an accordion.

## Risks / Things To Verify During Implementation
1. **Migration ordering** — same operational risk as every other `db/add-*.sql` file: the column must exist in Supabase before the `UPDATABLE_FIELDS` change ships, or ANY scene field save fails whole-request, not just this one.
2. **Transition + Ken Burns stacked on one scene** — flagged above; needs a manual look once built, not resolvable analytically ahead of time.
3. **Very short scenes** — `layoutScenes` already guarantees `durationInFrames >= 1`; the `interpolate()` call in `KenBurns` should guard with `Math.max(1, durationInFrames)` to avoid a degenerate range on a 1-frame scene.
4. **Media-type switching** — a scene later switched from image to video simply has its `ken_burns_enabled` flag ignored (UI hides it, render branch checks `mediaType === 'image'`), consistent with how other scene-specific fields behave across a media-type change; no auto-reset needed.

## Explicitly Out Of Scope (this pass)
- AI/vision-based selection of pan direction based on image content — considered and deliberately deferred (see Decisions above).
- Per-scene manual direction/variant picker in the UI — the toggle is on/off only; the system chooses the variant.
- Adjustable intensity/speed controls — fixed constants (`BASE_SCALE`, translate range, easing) for this pass.

## Critical Files
- `db/add-scene-ken-burns.sql` (new)
- `src/remotion/effects/KenBurns.tsx` (new)
- `src/remotion/types.ts`
- `src/remotion/compositions/VideoComposition.tsx`
- `src/components/ui/TimelineEditor.tsx`
- `src/app/actions/scene-actions.ts`
