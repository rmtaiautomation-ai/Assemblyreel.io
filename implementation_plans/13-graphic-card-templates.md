# 13 Graphic-Card Templates: Checklist Card & Title + Cutout Image Card

## Goal Description
Slice 1 (`implementation_plans/12-overlay-track-kinetic-text.md`) built the OV
track and 8 kinetic-typography text presets — all of them animate one block
of plain text. This plan is Slice 2: two **designed graphic-card templates**,
referenced against real examples during planning — a checklist-style info
card (colored header bar + bullet list with checkmark icons) and a title card
combining a background image with a foreground cutout/transparent-PNG image
(e.g. a name over a sky background with a statue cutout). These are a
different kind of thing from animated text: fixed layouts with their own data
(a list of bullets, one or two images), matching what CapCut calls "Text
Templates" (vs. plain "Text") and what Premiere calls Motion Graphics
Templates. They ship as new **kinds** of clip on the existing OV track, not a
second parallel system — reusing its timing, drag-to-position,
lane-stacking, properties panel, and persistence wholesale.

## Decisions Already Aligned With The User (do not re-litigate)
- **Two templates this pass**: Checklist Card and Title + Cutout Image Card.
  No third/fourth template now — that's a fast follow later using the same
  pattern, not part of this plan.
- **Built on the existing OV track**, not a new system. A graphic card is an
  `overlay_clips` row with a new `kind` field, not a new table or a new
  timeline track.
- **Image picker sources every project image** (uploads + AI-generated +
  stock picks), not just uploads like the main Media panel does today. The
  data is already fetched unfiltered by source at the query level, so this is
  a filter change, not a new query.
- **No background-removal/cutout-generation tooling.** The user supplies an
  already-transparent PNG; the upload pipeline already preserves alpha
  untouched (verified — no image processing exists anywhere in this app).
- **No bullet drag-reordering** this pass — add/remove/edit only.
- **No editing a clip's `kind` after creation** — delete and re-add instead.

## Proposed Changes

### 1. Database — `db/add-overlay-clip-templates.sql` (new)
Manual-run convention, same as every other `db/add-*.sql`:
```sql
alter table public.overlay_clips
  add column if not exists kind text not null default 'text',
  add column if not exists template_data jsonb not null default '{}'::jsonb;

comment on column public.overlay_clips.kind is
  'text | checklist-card | title-cutout-card. Determines which fields in template_data are read.';
```
`kind = 'text'` defaults every existing row to today's plain-text behavior —
no backfill needed, no change to the existing text-overlay render path.
`template_data` carries kind-specific fields as JSON rather than adding
sparse columns for two very different shapes:
- `checklist-card`: `{ bullets: string[] }`
- `title-cutout-card`: `{ backgroundImageUrl?: string, foregroundImageUrl?: string }`

Every other existing `overlay_clips` column is REUSED across kinds rather
than duplicated — see the field-mapping table below.

### 2. Field reuse across kinds (no new columns beyond `kind`/`template_data`)
| Column | `text` (existing) | `checklist-card` | `title-cutout-card` |
|---|---|---|---|
| `text` | the overlay's words | card title (header bar) | headline |
| `color` | text color | header bar accent color | fallback background color (used only when no background image is set) |
| `preset` | which of the 8 animations | unused | which of the 8 animations, applied to the headline only |
| `x_percent`/`y_percent` | center of the text | center of the whole card | center of the headline+cutout group |
| `start_time`/`duration`/`dim_background` | identical behavior across all three kinds — timing and the background scrim are properties of the CLIP, not the kind |

### 3. Render components — new `src/remotion/templates/` folder
Deliberately separate from `src/remotion/overlays/` (pure animated text) —
these composite a background, optional image(s), and layout, which is a
structurally different job.

- **`ChecklistCard.tsx`**: header bar (background = `color`, holding `text`
  as the title) above a body panel listing `template_data.bullets`, each row
  prefixed with a checkmark icon (`lucide-react`'s `Check` — already used
  throughout the editor, framework-agnostic, no new icon dependency). The
  card itself fades/rises in first (same spring-based entrance feel
  `PopIn.tsx` already establishes — reused, not reinvented), then each bullet
  staggers in one after another using the EXISTING `staggerProgress` helper
  from `src/remotion/overlays/kinetic-utils.ts`.
- **`TitleCutoutCard.tsx`**: an optional full-bleed background layer
  (`<Img src={backgroundImageUrl} style={{objectFit:'cover'}}>` — the exact
  pattern already used in `KenBurns.tsx` and `VideoComposition.tsx`'s image
  branch; falls back to a solid/gradient using `color` when no background
  image is set), the headline rendered through the EXISTING `renderPreset`
  function in `VideoComposition.tsx` (so it gets real kinetic-text motion
  for free — no new animation code for the headline itself), and a
  foreground cutout image (`<Img style={{objectFit:'contain'}}>` — new; no
  existing code in this app currently layers two images, this is the one
  genuinely new rendering technique in this plan).
- Both templates still render inside the EXISTING `OverlayFrame` (for
  `xPercent`/`yPercent` centering) and the EXISTING per-clip `<Sequence>` +
  scrim logic in `VideoComposition.tsx`'s `renderOverlayClip` — only WHAT
  renders inside the frame branches on `clip.kind`; timing, positioning, and
  persistence are untouched.

### 4. New image picker — the one genuinely new UI piece
No "pick an already-uploaded image" control exists anywhere in this app
today (confirmed during planning). The closest precedent — the stock-media
picker's stage-then-confirm interaction (`TimelineEditor.tsx`, ~lines
3844-3895) — downloads from a remote provider first, which doesn't apply
here since the image is already local. This picker is simpler: a small
thumbnail grid, a single click assigns it directly (no separate "Apply"
step), plus a "Clear" option.

Sources from every project image per the confirmed decision:
```ts
const allProjectImages = useMemo(
  () => initialMedia.filter(m => m.media_type === 'image').map(mediaRowToAsset),
  [initialMedia]
);
```
`initialMedia` (from `workspaces/[slug]/videos/[videoId]/page.tsx`) is
already the whole `media` table for the project, unfiltered by source — this
is a new filter, not a new query. Built once as a small reusable component,
used twice (Background slot, Foreground Cutout slot) in the Title + Cutout
Card's properties panel.

### 5. Editor UI — `src/components/ui/TimelineEditor.tsx`
- The OV track's single **"+ Add"** button becomes a small dropdown (same
  lightweight menu pattern already used for the ratio selector and the Ken
  Burns bulk-apply menu): **Add Text**, **Add Checklist Card**, **Add Title
  Card**. Each creates a new `overlay_clips` row with the matching `kind` and
  sensible `template_data` defaults (e.g. 3 placeholder bullets for a fresh
  checklist card), landing at the playhead exactly like a text clip does
  today — reuses the existing optimistic-create-then-reconcile pattern
  (`handleAddOverlayClip`) with a `kind` parameter added.
- The overlay clip properties panel branches on `selectedOverlayClip.kind`:
  - `'text'` → unchanged, exactly what exists today.
  - `'checklist-card'` → Title text (reuses the existing Text field), Accent
    Color (reuses the existing Color field), and a new bullets list editor
    (add/remove/edit rows, plain array UI).
  - `'title-cutout-card'` → Headline text + Animation preset dropdown (both
    reuse existing controls, restricted to the 8 text presets), Color
    (relabeled "Fallback background color" in this context), and the two new
    image-picker slots (Background, Foreground Cutout).
- Position (drag-on-preview, quick presets) and timing (drag/trim on the OV
  track, right-click delete) work identically for every kind — no new code
  needed there; both are already generic over "an overlay clip."

### 6. Server action — `src/app/actions/overlay-clip-actions.ts`
`UPDATABLE_FIELDS` gains `"kind"` and `"template_data"`, with the same
"requires migration to have run first" comment convention already used for
every prior field addition in this file.

## Risks / Things To Verify During Implementation
1. **`template_data` shape drift** — `kind` and `template_data` must always
   agree (a `'checklist-card'` row should never have a
   `title-cutout-card`-shaped `template_data`). Since this is JSON with no DB
   schema enforcement, the render and edit paths must both guard on `kind`
   before reading `template_data` fields, not assume they're present.
2. **Foreground image transparency** — confirm a real transparent PNG
   composited via `objectFit: 'contain'` actually shows through to the
   background layer beneath it in an actual render, not just in the editor
   preview (headless Chromium rendering can occasionally differ from browser
   preview for alpha compositing — worth a direct `npx remotion still`
   check, same verification style used for Slice 1).
3. **Empty/missing template_data on old rows** — every row created before
   this migration has `template_data = '{}'`, which is only valid for
   `kind='text'` (the default). Confirm nothing crashes if a future bug ever
   produces a `checklist-card` row with no `bullets` array — the render
   component should treat a missing/empty bullets array as "just show the
   header," not throw.

## Explicitly Out Of Scope (this pass)
- Reordering bullets by drag.
- A third or fourth template.
- Background-removal or cutout-generation tooling.
- Editing an existing clip's `kind` after creation.

## Critical Files
- `db/add-overlay-clip-templates.sql` (new)
- `src/remotion/templates/ChecklistCard.tsx` (new)
- `src/remotion/templates/TitleCutoutCard.tsx` (new)
- `src/remotion/compositions/VideoComposition.tsx`
- `src/components/ui/TimelineEditor.tsx`
- `src/app/actions/overlay-clip-actions.ts`
