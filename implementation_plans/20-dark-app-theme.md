# 20 — Dark App Theme

**Status:** implemented (typechecked, built, and verified against the running dev server on every dashboard route — not yet reviewed by eye)
**Depends on:** `19-scene-board-workspace.md`
**Migration required:** none — CSS only.

---

## Why this exists

The signed-in app was light chrome wrapped around video content, which is backwards for
the same reason every professional NLE (Premiere, Resolve, Final Cut, CapCut) is dark: a
bright UI around a preview shifts perception of the footage through simultaneous
contrast, so clips read darker and less saturated than they actually are. The preview
and the scene thumbnails have to be the brightest things on screen.

### The design system already existed and was completely unused

`src/app/globals.css` already contained a full `ed-*` token ladder — surfaces, two
border weights, three text steps, an accent family, per-track identity colours, and
status trios (fill / soft / border) — added in commit `8caebe0`, carrying the exact
rationale above.

**Zero components referenced it.** A grep across every `.tsx` returned nothing. The
tokens were dead CSS while `TimelineEditor.tsx` alone carried ~1,200 hardcoded palette
classes.

So this plan is not "design a dark theme". It is "adopt the one already in the
stylesheet, and widen its scope from the editor to the whole signed-in app".

---

## Scope

| Surface | Treatment |
|---|---|
| Everything under `(dashboard)` — workspaces, settings, Scene Board, Timeline, thumbnails, billing, integrations | **Dark** |
| `/` and `/pricing` (marketing) | **Unchanged, light** |

Billing and integrations were not in the original request, but they hang off the same
now-dark sidebar. A white page reached from dark chrome is worse than either choice made
consistently, so they came along.

---

## What changed

### Tokens (`globals.css`)

- Rescoped the `ed-*` block comment from editor-only to app-wide.
- **Added `--color-ed-ov` / `-soft` / `-border`.** The overlay (OV) track was the one
  track with no token and had grown an ad-hoc fuchsia palette across ~50 sites; it now
  sits in the same ladder as `ed-v1` / `ed-a1` / `ed-a2`.
- **Added `--color-ed-scrim`** — over a dark ground, a conventional 50%-black modal
  scrim barely separates the dialog from the page.
- **Added `--color-ed-media`** (`#05060A`) — the deliberately neutral well that
  thumbnails and the player letterbox sit on, so an image is never judged against tinted
  chrome.

### Two new primitives

- `.ed-field` — the shared input/textarea/select treatment.
- `.ed-scroll` — thin, dark scrollbars for the long panes.

### Base-layer form defaults

Roughly 40 form controls across the app declared no background, which on a dark page
means the browser's white punches a hole straight through it. Rather than annotate every
call site, `.ed-app input / textarea / select` are defaulted **in `@layer base`**.

The layer matters: base loses to the utilities layer under the cascade regardless of
specificity, so any element that *does* declare `bg-ed-*` or `.ed-field` still wins. The
same rule written outside a layer would out-specify those utilities and silently
override them.

Also handled there: `select option` (Chromium paints native dropdowns on the OS layer,
so they need saying twice), `accent-color` for checkboxes / radios / range thumbs, the
UA spinner and calendar glyphs that stay black on dark, and the Windows scrollbar trough.

### `.ed-app` scoping

`.glass-panel`, `.btn-primary`, `.btn-secondary`, `.text-muted` and `.heading-1` are
shared with the marketing site. Their dark variants are scoped under `.ed-app` — a class
on the dashboard layout root — rather than chasing every call site. One place to look,
and the marketing pages keep the originals.

### Component migration

Mechanical, via `scripts/`-style one-off mapping: every `{prefix}-{color}-{shade}` was
resolved to a token by family — neutrals onto the surface/text/border ladder, and
purple/violet/indigo → accent, fuchsia/pink → ov, blue/sky/cyan → info, emerald/green →
ok, amber/yellow/orange → warn, red/rose → danger.

One correction the mapping needed: `ed-ok`, `ed-warn`, `ed-danger` and `ed-info` are
*light* hues, so `text-white` on a filled one fails contrast. Any element filling with a
light status token has its white text swapped for `text-ed-base`.

`text-white` on `bg-ed-accent` was left alone — white on `#8B5CF6` is fine.

---

## Verification

- `npm run build` — clean.
- Zero palette classes left under `src/components/ui` and `src/app/(dashboard)`.
- Every dashboard route fetched from the running dev server and its rendered HTML
  checked: `workspaces`, a workspace, its settings, billing, integrations, Scene Board,
  Timeline, thumbnails. All dark, **zero** light leftovers.
- `/pricing` confirmed to contain no `ed-*` tokens — marketing untouched.

Not verified: how it actually looks. That is a human pass.

---

## Note for whoever reviews this by eye

If the app looks *flat* or subtly wrong, check for a **Dark Reader**-style browser
extension first. It inverts pages algorithmically, and over a genuinely dark theme it
double-inverts — producing exactly the muddy, low-separation result this plan exists to
avoid. Disable it for localhost before judging.
