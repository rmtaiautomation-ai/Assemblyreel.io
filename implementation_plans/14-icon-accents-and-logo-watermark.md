# 14 Animated Icon Accents & Logo Watermark

## Goal Description
Slice 3 of the motion-graphics roadmap. Originally noted as three words —
"animated icons/logos, data callouts, transitions" — with no detail behind
any of them. Clarified during planning: **"transitions" was a mislabel and
is dropped** (the app already has cut-transitions on V1 and Transition Sound
on A2, built separately); **"data callouts" is explicitly deferred** — the
user wants a research pass before it's designed, so this plan does not touch
it; **"icons/logos" splits into two distinct features**, confirmed by the
user as separate things worth planning independently:

1. **Animated Icon Accents** — small decorative icons (a checkmark, arrow,
   star, etc.) that pop in as standalone overlay elements, placeable
   anywhere — the same spirit as the checklist card's checkmarks
   (`implementation_plans/13-graphic-card-templates.md`), but as their own
   free-standing pieces rather than bundled inside a card layout.
2. **Logo Watermark** — the user's own brand logo/watermark, typically
   pinned to a corner and present for most or all of the video, distinct
   from a short timed accent.

Unlike slices 1 and 2, this plan was NOT built from extensive back-and-forth
on exact interactions — the two features below are the author's best-reasoned
design given the confirmed scope, following the same architecture already
proven twice. Flagged assumptions are called out explicitly so they're easy
to correct on review, rather than presented as settled decisions.

## Decisions Already Aligned With The User (do not re-litigate)
- **"Transitions" is not part of this slice** — already shipped elsewhere,
  included in the original 3-word note by mistake.
- **"Data callouts" is not part of this slice** — deferred pending a
  separate research pass; no design attempted here.
- **Icon accents and the logo watermark are two distinct features**, not one
  — confirmed by the user, reflected as two clearly separated sections below
  rather than one blended design.

## Assumptions Made For This Draft (flag if wrong — easy to change before build)
- Icon accents draw from a **curated built-in icon set** (this app's
  existing `lucide-react` dependency — zero new assets, consistent with
  every icon already used throughout the editor's own UI) rather than
  requiring an upload. If the intent was closer to "any small image/sticker
  the user supplies," that's a materially different, simpler-to-build
  feature (it would just reuse slice 2's image picker directly) — worth
  confirming before implementation starts.
- Icon accents get **one entrance style** (a spring pop-in, reusing
  `PopIn.tsx`'s exact spring config) rather than a full preset dropdown like
  text overlays have — these are meant to be lightweight accents, not a
  titling system. More entrance styles can be added later the same way the
  kinetic-text presets grew from 4 to 8.
- The logo watermark defaults to **spanning the whole current timeline
  length** when added (matching how a real watermark behaves — present for
  the whole video, not a short beat), with a corner placement preset,
  rather than requiring the user to manually stretch it across everything.

## Proposed Changes

### 1. Database — extend `overlay_clips` again, same pattern as slice 2
No new table. `implementation_plans/13-graphic-card-templates.md` already
established the `kind` + `template_data jsonb` pattern for non-text overlay
clips — this plan adds two more `kind` values to that same column via a
second additive migration, `db/add-overlay-clip-icons.sql`:
```sql
-- kind gains 'icon-accent' and 'logo-watermark' (no ALTER needed on `kind`
-- itself — it's already a free-text column per 13's migration, matching the
-- scenes.transition_type convention: a new value is a code change, not a
-- schema change). Only template_data shapes are new, and template_data
-- already exists as a column, so this migration has NOTHING to add for
-- these two kinds specifically — noted here for completeness, not because
-- SQL is required. If slice 2 has not shipped yet, its migration
-- (db/add-overlay-clip-templates.sql) must run first.
```
Actual new data, both carried in the existing `template_data jsonb` column:
- `icon-accent`: `{ iconName: string }` — a key into the curated icon set
  (see §2), e.g. `"Check"`, `"ArrowRight"`, `"Star"`.
- `logo-watermark`: `{ imageUrl: string }` — reuses `mediaId`/persisted URL
  resolution the same way slice 2's cutout image does, via the image picker.

`text`/`color`/`x_percent`/`y_percent`/`start_time`/`duration`/`dim_background`
are reused exactly as they are for every other kind — `color` tints the icon
(icon-accent only; unused for logo-watermark, which renders the logo image
as-is), `text` is unused by both.

### 2. Render components — `src/remotion/templates/`
Alongside `ChecklistCard.tsx`/`TitleCutoutCard.tsx` from slice 2:

- **`IconAccent.tsx`**: renders one `lucide-react` icon (looked up from
  `template_data.iconName` against a small allowlist map — NOT arbitrary
  dynamic import of the whole icon library, to keep the render bundle
  bounded) at a size derived from `fontSize` (reusing that existing field
  rather than adding a new `size` column), tinted by `color`, with a spring
  pop-in reusing `PopIn.tsx`'s spring config directly (import and reuse, not
  copy the numbers). Same exit-fade convention as every other overlay.
- **`LogoWatermark.tsx`**: renders `template_data.imageUrl` via
  `<Img style={{objectFit:'contain'}}>` — the same pattern
  `TitleCutoutCard.tsx` (slice 2) already establishes for a foreground
  cutout image, reused here rather than reinvented. Simple fade/scale-in on
  first appearance, then holds static — a watermark that kept animating for
  20 minutes would be distracting, not polished.
- Both wrapped by the existing `OverlayFrame` (position) and the existing
  per-clip `<Sequence>` + scrim logic in `VideoComposition.tsx`'s
  `renderOverlayClip` (`clip.kind` gains two more branches) — no changes to
  timing, positioning, or persistence machinery, exactly as slice 2 didn't
  need any either.

### 3. Curated icon set — `src/remotion/templates/icon-registry.ts` (new)
A small, explicit allowlist map (`Record<string, LucideIcon>`) of maybe
15-20 commonly-useful icons for video accents (Check, X, ArrowRight,
ArrowUp, Star, Heart, ThumbsUp, AlertTriangle, Zap, TrendingUp, etc.) —
curated rather than exposing all of `lucide-react`, so the icon picker UI
(next section) is a manageable grid, not an unbrowsable wall of hundreds of
icons.

### 4. Editor UI — `src/components/ui/TimelineEditor.tsx`
- The OV track's "+ Add" dropdown (already a menu as of slice 2: Add Text /
  Add Checklist Card / Add Title Card) gains **Add Icon Accent** and **Add
  Logo Watermark**.
  - Add Icon Accent creates a short default-duration clip (matching the
    existing text-clip default) with a sensible starting icon (e.g. "Check").
  - Add Logo Watermark creates a clip whose duration defaults to the current
    total timeline length (read the same `remotionTotalDurationInFrames`
    value already computed for the composition) and whose position defaults
    to a bottom-right preset — both changeable afterward like any clip.
- Properties panel gains two more `selectedOverlayClip.kind` branches:
  - `'icon-accent'` → a small icon grid picker (sourced from the curated
    registry in §3 — a compact version of the same click-to-assign
    thumbnail-grid pattern slice 2's image picker established) + Color.
  - `'logo-watermark'` → the EXISTING image picker component from slice 2,
    reused as-is for a single "Logo Image" slot (no background/foreground
    split needed — just one image).
- Position and timing controls (drag-on-preview, quick presets, OV-track
  drag/trim, right-click delete) work identically for both — no new code,
  exactly as established for every prior kind.

### 5. Server action
No change needed beyond what slice 2 already adds — `kind` and
`template_data` are already in `UPDATABLE_FIELDS` once
`overlay-clip-actions.ts` is updated for slice 2; these two new `kind`
values flow through the same allowlisted fields with no further work.

## Risks / Things To Verify During Implementation
1. **Confirm the icon-vs-upload assumption** (see Assumptions section) before
   building — this is the single biggest branch point in this plan and cheap
   to get wrong if the user actually wanted arbitrary custom icon images.
2. **Icon registry bundle size** — verify importing ~20 named icons from
   `lucide-react` in a Remotion-rendered component doesn't meaningfully bloat
   the render bundle; tree-shaking should keep this trivial, but worth a
   sanity check given `lucide-react` has hundreds of icons total.
3. **Logo watermark duration vs. a growing/shrinking timeline** — since it
   defaults to "whole timeline" at creation time rather than dynamically
   tracking timeline length, adding scenes after placing the watermark will
   NOT automatically extend it. Decide whether that's acceptable (matches
   how every other timed clip already behaves — nothing auto-extends) or
   needs a "stretch to fit" affordance.
4. **Multiple logo watermarks** — nothing in this design prevents adding two,
   which would just lane-stack like any overlapping OV clips. Not
   necessarily wrong (a client might legitimately want two brand marks) but
   worth a conscious call rather than an accident of reused machinery.

## Explicitly Out Of Scope (this pass)
- Data callouts (animated stat counters, charts) — deferred, needs its own
  research and planning pass.
- Cut-transitions / transition sounds — already shipped, not part of this
  slice; included in the original note by mistake.
- Arbitrary custom icon uploads (see Assumptions) — curated set only, unless
  revisited.
- A "stretch to fit timeline" control for the logo watermark.
- Continuous idle animation (looping pulse/bounce) for icon accents beyond
  the one-time entrance pop.

## Critical Files
- `db/add-overlay-clip-icons.sql` (new, likely a no-op/documentation-only
  migration — see §1)
- `src/remotion/templates/icon-registry.ts` (new)
- `src/remotion/templates/IconAccent.tsx` (new)
- `src/remotion/templates/LogoWatermark.tsx` (new)
- `src/remotion/compositions/VideoComposition.tsx`
- `src/components/ui/TimelineEditor.tsx`
