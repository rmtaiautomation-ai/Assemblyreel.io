# 15 Environmental Overlay Effects: Floating Particles & Light Beam

## Goal Description
Add two atmospheric, additively-blended effects that sit between the footage and the text: **floating particles** (drifting gold/white motes, the "dust particles" or "bokeh overlay" of stock-footage packs) and a **light beam** (a soft god-ray shaft, "light rays" in Resolve, Trapcode Shine in After Effects). Both are generated procedurally from CSS gradients and seeded random values rather than shipped as stock video assets, so they cost nothing in bundle size and are fully parameterizable.

Both are new **kinds** on the existing OV track, joining `dim-scrim` as full-frame layers with their own independent timing. This is the same "adding a kind is a code change, not a migration" path established by `implementation_plans/13-graphic-card-templates.md`.

## Decisions Already Aligned With The User (do not re-litigate)
- **Not both at once on the same shot.** Particles and a light beam stacked on one shot reads as busy and cheap. These are alternatives, not a combo. This is a **taste guideline, not an enforced constraint** — no code prevents it, and no validation should be added to block it.
- **Phased, not shipped together.** Particles first (Phase A), light beam second (Phase B). The shared groundwork in Phase A is what Phase B builds on.
- **Procedural, not stock assets.** The conventional way to do both effects (CapCut, Premiere) is a stock video on a black background set to Screen blend. We are generating them instead: parameterizable, zero asset weight, no licensing. Accepted tradeoff — stock footage carries filmed lens dirt, haze variation, and grain that gradients cannot fake.

## Addendum: `light-sweep` added (2026-08-14)
After reviewing captured reference footage, the effect the user actually wanted was **not** a god-ray beam. The vertical line in the reference **travels horizontally across the frame** — a *light sweep* (After Effects ships it as CC Light Sweep; also "shine sweep", "glint", "glare pass").

This is a distinct kind, `light-sweep`, in `templates/LightSweep.tsx`. The distinction that matters: a **beam holds position** in the scene while air drifts through it; a **sweep crosses edge to edge** and repeats on its own cycle. Same screen-blend plumbing, opposite motion — separate components, not one with a flag. The travelling-gradient-stop technique is the one already proven in `transitions/LightLeak.tsx`, the difference being that this repeats on a `cycleSeconds` cycle as an overlay clip rather than being driven by a transition's one-shot progress.

Render-verified at frames 30/60/90 of a 4s cycle (band at left / centre / right). One correction came out of it: the initial `width: 12` default spanned nearly half the frame and read as a **wash sliding across the shot**, not a line. Defaults are now `width: 5`, `intensity: 0.5` — the gradient spans 2x `width` either side, so the parameter is roughly a quarter as wide as it intuitively reads.

`LightBeam` is kept, not replaced — it remains the right effect for a shaft anchored in the scene.

## Status: BUILT (2026-08-14)
Both phases implemented and verified with real `npx remotion still` renders at 1080x1920, not just `tsc`/lint. Resolved as **OV-track clips** per the recommendation below.

Three corrections came out of the render pass that this plan had wrong:

1. **The streak gradient angle was backwards.** `repeating-linear-gradient` produces bands *perpendicular* to its angle, so the planned `178deg` gave horizontal bands across the shaft — the exact scanline artifact the plan claimed it avoided. Striations must run *along* the beam, so the angle is `88deg` and the drift is on X, not Y.
2. **A feathered mask with a flat opaque core renders as a slab.** Holding `black` across the full ±`width` makes every pixel of the core equally bright, which reads as a lit rectangle. The mask is now a continuous bell peaking only at the centre line, and the vertical falloff is steeper (full → 55% → 20% → 0 by 88% height).
3. **Linear ramps to zero alpha leave visible vertical seams.** The kink in the alpha curve at the outermost mask stop reads as a Mach band down the frame. Fixed with an intermediate 0.08 stop easing the curve into zero.

There is also **no `tint` field** on either data type, contrary to section 2 below. Storing an `r,g,b` triple in `template_data` duplicated `overlay_clips.color`; the components take the hex `color` and convert via a new `templates/hexToRgbTriple.ts`.

## Open Decision (resolved: OV-track clip)
**OV-track clip vs. per-scene property.** The codebase has both precedents: `KenBurns` is a scene property with its own DB column, `DimScrim` is an OV clip.

**Recommendation: OV clip**, decisively for particles. A particle field is meant to read as *air in front of the whole frame*. As a scene property it would restart at every scene cut — motes teleporting back to their seeded positions on each edit point, which destroys the illusion outright. The OV track lets one particle clip run continuously across a dozen cuts, which is exactly how the stock-overlay workflow it imitates is used. Ken Burns is a scene property because it is a transform *of that image*; these are layers *over everything*.

Secondary benefits: no DB migration (`kind` is free text, `template_data` is `jsonb`), and independent fade timing comes free from the existing clip model.

If the scene-property route is chosen instead, this plan changes substantially: drop sections 3 and 5 below, add a `db/add-scene-*.sql` migration plus a `scene-actions.ts` `UPDATABLE_FIELDS` entry, and move the UI into the Scene Info panel following `implementation_plans/11-ken-burns-image-effect.md` section 7.

---

## Proposed Changes

### 1. Shared fade helper — `src/remotion/templates/fadeProgress.ts` (new)
Extract the clamped two-`interpolate` fade currently inline in `DimScrim.tsx:36-47`. Three kinds need it once this lands, and the clamping logic (guarding against zero-width `interpolate` ranges when fades are longer than the clip or overlap each other) is subtle enough that it must not be re-derived per component.

```ts
export const fadeProgress = (
  frame: number, fps: number,
  fadeInSeconds: number, fadeOutSeconds: number, durationInFrames: number
): number => { /* logic moved verbatim from DimScrim */ };
```

`DimScrim.tsx` is then rewritten to call it. **Behavior must be identical** — this is a pure extraction, verified by the scrim looking unchanged, not a redesign.

### 2. Render-facing types — `src/remotion/types.ts`
- Extend the union at line 36: `… | 'dim-scrim' | 'particles' | 'light-beam'`
- Update the kind-enumerating doc comment at lines 27-35, which currently names every kind explicitly.
- New interfaces beside `DimScrimData`:

```ts
/** `template_data` shape for the 'particles' kind. */
export interface ParticleFieldData {
  count?: number;          // default 45
  tint?: string;           // 'r,g,b' triple, default warm gold '255,225,170'
  speed?: number;          // vertical drift multiplier, default 1
  sizeScale?: number;      // default 1
  xBias?: number;          // 0-100, cluster centre; omitted = even spread
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/** `template_data` shape for the 'light-beam' kind. */
export interface LightBeamData {
  xPercent?: number;       // shaft centre, default 50
  width?: number;          // half-width of core as % of frame, default 14
  intensity?: number;      // 0-1, default 0.75
  tint?: string;           // 'r,g,b' triple
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}
```

- Extend the `templateData` union at line 104 with both.

Note both carry their own `xPercent` rather than reusing `OverlayClipData.xPercent`, because these kinds skip `OverlayFrame` entirely (see section 4) and so never consume the clip-level position fields.

### 3. Z-order and lane generalization (the load-bearing refactor)
The same two-bucket `dim-scrim` vs. everything-else split was written independently in two places, and both are wrong once a third environmental kind exists:

- **`VideoComposition.tsx:298-299`** — render order. Replace the two `.filter()` passes with a `zRank(kind)` sort: scrim `0`, particles/beam `1`, text/cards `2`. A beam must paint *above* the scrim (it adds light back onto the darkened frame) but *below* text (it is environmental; a lower-third must never be lit or dimmed by it). In the current two-bucket split it lands with text, where array creation order silently decides whether it washes over your captions.
- **`TimelineEditor.tsx:197-207`** (`packOverlayLanes`) — timeline lane assignment. Environmental kinds belong in the scrim's separate lane pool near V1, for the reason already documented at lines 190-196: they are background layers, not content competing for screen space, and sharing a lane pool with text makes their rows jump around when dragged.

Introduce one exported predicate used by both sites so the two cannot drift apart again:
```ts
export const isEnvironmentalKind = (k: OverlayClipKind) =>
  k === 'dim-scrim' || k === 'particles' || k === 'light-beam';
```

### 4. Positionless-kind handling — `src/remotion/compositions/VideoComposition.tsx`
The early return at line 163 special-cases `kind === 'dim-scrim'` to skip `OverlayFrame`. Generalize it to all environmental kinds, but **do not copy the existing comment verbatim** — it justifies the skip on the grounds that a scrim "has no position," which is false for a beam. A beam skips `OverlayFrame` for a different reason: it needs animated sub-pixel positioning through its own gradient mask, not the 9-slot placement grid.

### 5. `ParticleField.tsx` — `src/remotion/templates/` (new, Phase A)
- **Determinism is mandatory.** Particle attributes come from Remotion's `random(seed)` with stable string seeds, never `Math.random()`. Remotion renders frames across parallel workers; each would roll different values per frame and produce strobing noise instead of a particle field. This is a correctness requirement, not a style preference.
- ~45 particles, each with seeded `x`, start `y`, size, speed, and sway phase. Size drawn as `random() ** 2` so the field is many small motes and a few large ones, not a uniform scatter.
- Per frame: drift upward with modulo wrap, sinusoidal horizontal sway, twinkle via a sine on opacity.
- **Depth of field is what sells it.** Tie blur and opacity to size — large motes soft and dim (near, out of focus), small ones crisp and bright (far, in focus). Without this, N identical dots read as a screensaver rather than as air.
- `mixBlendMode: 'screen'`, so black contributes nothing and only the motes survive.

### 6. `LightBeam.tsx` — `src/remotion/templates/` (new, Phase B)
- Vertical gradient for top-bright/bottom-dissipating falloff; horizontal mask to make it a shaft rather than a wash; `blur(~40px)` for volumetric haze; `mixBlendMode: 'screen'`.
- **Motion via three incommensurate oscillators** (drift ~0.23/0.41 Hz, intensity swell ~0.17/0.29, width waver ~0.31). A single sine reads as mechanical — the eye locks onto the period within two cycles. Ratios sharing no common period never visibly repeat within a normal clip length.
- Second layer of drifting `repeating-linear-gradient` streaks at a slight lean (178deg, not 180deg, which would read as a scanline artifact), translated by `(t * 14) % 22` — twice the gradient period, so the loop is seamless.
- Reuses the technique already proven in `src/remotion/transitions/LightLeak.tsx:33-41`.

### 7. Editor UI — `src/components/ui/TimelineEditor.tsx`
`OVERLAY_KIND_ACCENT` (line 148) is a `Record<OverlayClipKind, …>`, so extending the union produces a **compile error that enumerates every site needing an update**. Let the type checker drive this rather than hunting by hand. Known touchpoints:
- `OVERLAY_KIND_ACCENT` — stripe/icon colors (amber for particles, yellow for beam).
- Defaults factory (~line 1975) — a case per kind. Note the precedent set by `dim-scrim` there: `color` is not text color for these kinds, so white is the wrong default. Particles default to pale gold, beam to warm `#FFE1AA`.
- `selectedParticleData` / `selectedLightBeamData` memos alongside line 3464.
- Inspector icon and title (lines 4022-4040) — `Sparkles` and `Sun` from lucide.
- Inspector controls after line 4272 — sliders per the `template_data` fields in section 2.
- The "add overlay clip" menu, wherever it enumerates selectable kinds.

### 8. `db/add-overlay-clip-templates.sql` — comment only
The `comment on column` at lines 23-24 enumerates valid kinds. Update the text for accuracy. **No schema change**; the file stays safe to re-run.

---

## Risks / Things To Verify During Implementation
1. **Stacking contexts break `mix-blend-mode`.** A blending element only blends against the backdrop within its nearest stacking-context *ancestor*. The current path (`AbsoluteFill` at `VideoComposition.tsx:193` → `Sequence` → clip) creates none, so blending reaches the scene correctly. Adding `opacity`, `filter`, `transform`, or `isolation` to any wrapper *above* these clips would silently degrade them to blending against black. Note that these properties on the effect element *itself* are fine — `LightLeak.tsx:39` animates `opacity` on the blending element and blends correctly.
2. **Full-frame blur is the render-cost hotspot.** `blur(40px)` across a 1080p canvas is per-frame Skia work, and the beam stacks two blurred layers. If render times regress noticeably, render the beam into a smaller absolutely-positioned box (~30% frame width) instead of a full `AbsoluteFill` — same look, a fraction of the pixels. Particles are cheap by comparison (small elements, blur only on the few large motes).
3. **No occlusion.** A screen-blended overlay has no depth or matte data, so a light beam washes over a person standing "in" it instead of being blocked by them. Mitigate by positioning the shaft away from the subject, or by baking the beam into the AI-generated image at generation time and using a low-intensity procedural layer only for the motion. Verify against a shot with a centered subject before considering the beam done.
4. **The `fadeProgress` extraction must be behavior-neutral.** Confirm an existing dim-scrim clip renders identically before and after section 1.
5. **Very short clips** — `fadeProgress` already clamps against zero-width `interpolate` ranges; confirm this survives the extraction intact for a 1-frame clip.

## Explicitly Out Of Scope (this pass)
- Stock-footage particle/beam assets as an alternative source.
- Any validation preventing particles and a beam on the same shot — a taste guideline only, per Decisions above.
- Masking/occlusion of the beam against subjects in the footage.
- Baking effects into images at generation time (a generation-pipeline change, not a render change).
- Presets or one-click "apply to all scenes" actions.

## Critical Files
- `src/remotion/templates/fadeProgress.ts` (new)
- `src/remotion/templates/ParticleField.tsx` (new, Phase A)
- `src/remotion/templates/LightBeam.tsx` (new, Phase B)
- `src/remotion/templates/DimScrim.tsx` (fade extraction)
- `src/remotion/types.ts`
- `src/remotion/compositions/VideoComposition.tsx`
- `src/components/ui/TimelineEditor.tsx`
- `db/add-overlay-clip-templates.sql` (comment only)
