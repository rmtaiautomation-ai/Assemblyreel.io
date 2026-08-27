# 21 — Green Accent Theme

**Status:** implemented (built clean, all dashboard routes render, compiled CSS verified — the eye pass is still the user's)
**Depends on:** `20-dark-app-theme.md`
**Migration required:** none — CSS and class names only.

---

## Why this exists

Plan 20 adopted the `ed-*` dark theme app-wide and closed with "Not verified: how it
actually looks. That is a human pass." That pass happened, and the verdict was that the
app read heavy and murky. A Deepgram console screenshot was brought in as the target
feel — "user friendly and eye catching" — with a request to move off violet onto green.

### The premise needed one correction

The stated problem was "our app is too dark." **Deepgram is darker than we were.** Their
ground is `#0B0C0E`; ours was `#0E1013`. Lightening the app would have moved away from
the reference, and would have undermined the reason plan 20 exists in the first place:
a brighter UI makes preview footage read darker and less saturated through simultaneous
contrast.

So the app stays dark. What was actually missing were three things the reference has:

**1. A light accent, not a dark one.** `#8B5CF6` sits at roughly the same luminance as
the panels around it, so it added weight rather than light. `#13EF93` is high-luminance —
it glows against near-black and lifts the whole page. This is the single biggest
difference between the two screenshots and the thing that reads as "friendly."

**2. Hueless neutrals.** The original ladder (`#161920`, `#1E222B`, `#272C37`) carried a
real blue cast. At these luminances blue-grey reads cold and muddy, and it muffles
whatever accent sits on top of it. Deepgram's greys are essentially hueless, which is
*why* one green can pop out of them.

**3. Sparse use of the accent.** Deepgram fills with green almost nowhere — one play
button, a 1px ring on the selected row, a checkmark, some text. The highest-emphasis
button on their page is *white*.

---

## What changed

### Tokens (`globals.css`)

Every token *name* was kept — 351 call sites depend on them, so this is almost entirely
a values change.

| Token | Was | Now |
|---|---|---|
| `ed-base` | `#0E1013` | `#0A0B0D` |
| `ed-surface` | `#161920` | `#131417` |
| `ed-raised` | `#1E222B` | `#1A1C20` |
| `ed-hover` | `#272C37` | `#232529` |
| `ed-well` | `#101216` | `#17191D` (raised — see follow-up) |
| `ed-border` | `#272C36` | `#26282D` |
| `ed-border-strong` | `#39404E` | `#383A41` |
| `ed-text` / `-dim` / `-faint` | `#E7EAF0` / `#A2AAB9` / `#6D7585` | `#EDEDEF` / `#9C9EA6` / `#6B6D75` |
| `ed-accent` | `#8B5CF6` | `#13EF93` |
| `ed-accent-hover` | `#7C3AED` | `#0BD584` |
| `ed-accent-text` | `#C4B5FD` | `#7FF0BE` |
| `ed-accent-soft` | `#241E3A` | `#0D1A16` |
| `ed-accent-border` | `#4C3A85` | `#1F6B4C` |
| `ed-ok` / `-soft` / `-border` | `#34D399` / `#10281F` / `#1F4D3A` | `#2BBF87` / `#0F2419` / `#1D4D37` |

**Added `--color-ed-chrome: #050507`** — navigation chrome that sits *behind* the content
plane. `ed-media` (`#05060A`) is a near-identical value but is documented as media-only,
so it was not reused.

**Left alone:** track identity (`ed-v1` stays violet — content identity, not chrome, and
keeping it preserves the four-way V1/A1/A2/OV separation at zero cost), `ed-info`
(already essentially Deepgram's link blue), and all marketing tokens.

### The green-on-green collision

A green accent collides with green-means-success. Resolved by **luminance separation, not
hue**: the accent is always the brightest, most chromatic green on screen and always means
"interactive"; `ed-ok` was stepped back to `#2BBF87` and always means "state". Recolouring
success away from green would have broken a stronger convention than it fixed. None of the
71 `ed-ok` call sites changed.

### Contrast: the accent is now a background for *dark* text

White on `#13EF93` is ~1.6:1. Deepgram never does it — their play glyph is black. All 24
lines pairing a green fill with `text-white` were switched to `text-ed-base` (~12:1),
plus one white check glyph sitting on a green circle in `WorkspaceForm.tsx`. This is the
same correction plan 20 already applied to `ed-ok` / `ed-warn` / `ed-danger`.

`.ed-app .btn-primary` also needed an explicit `text-ed-base`, since it inherits
`text-white` from the marketing `.btn-primary` it shares.

Worth noting: `text-ed-accent` appears **128 times**, and violet on a dark ground was
~3.3:1 — technically failing. Mint is ~11:1, so those 128 sites got more readable for free.

### 23 dead hover classes

`hover:bg-ed-ed-accent-hover` — doubled prefix, compiling to nothing. **Every primary
button in the app had no hover state**, across `TimelineEditor` (13), `SceneBoard` (3),
`ThumbnailPanel` (2), `NewVideoForm` (2), `workspaces/page` (2), `WorkspaceForm` (1).
Its own contribution to the flat feeling, and unrelated to colour.

### Elevation inverted

The sidebar was `bg-ed-surface` — *lighter* than the `bg-ed-base` content beside it, so
navigation chrome was the brightest thing on screen. Now `bg-ed-chrome`, so content floats
forward. Same treatment for the Scene Board act-rail and the scene-board / thumbnails page
headers. The collapse toggle moved to `bg-ed-surface border-ed-border-strong` to stay
visible against the darker rail.

### Emphasis ladder

Two primitives added beside `.ed-field`:

- **`.ed-cta`** — white pill, at most one per screen. When something must outrank an
  accent fill it goes white rather than "more green" (Deepgram's "Free API Key").
- **`.ed-selected`** — tint + hairline + glyph, no fill. The state treatment the accent
  should carry almost everywhere.

Solid accent fills went **44 → 24**. (Plan-stage estimate of "102" was a miscount: the
`bg-ed-accent\b` grep also matched `-soft`, `-border` and `-hover`.) Most remaining fills
are legitimate — real primary buttons, toggle ON states, drag handles. The ones actually
converted were *selected states* wearing a fill, plus two that would have screamed in
mint: the duration chip and the chat transcript, where every user message was a solid
accent block.

Also fixed: `shadow-neon` under the Voice Cloning button — that shadow is built from the
**marketing blue** (`rgba(29,78,216,.15)`), so it was a blue halo under a green button.

---

## Verification

- `npm run build` — clean, all 20 routes.
- Compiled CSS: `#13ef93` present, **`#8b5cf6` absent entirely**, `bg-ed-chrome` /
  `ed-cta` / `ed-selected` all emitted.
- `grep "ed-ed-"` → zero. Green fill + `text-white` → zero. Hardcoded violet/purple →
  still zero.
- Marketing (`/`, `/pricing`) contains zero `ed-*` design tokens — untouched, still light
  and blue.
- `/workspaces`, `/billing`, `/integrations` fetched from the dev server: all 200, sidebar
  chrome rendering, CTA rendering, no white-on-green in the output HTML.

**Not verified:** how it actually looks. Still a human pass — but now against a concrete
reference.

> Before judging any screenshot: disable Dark Reader / auto-inverting extensions for
> localhost. They double-invert a genuinely dark theme into exactly the muddy,
> low-separation result this work exists to fix.

---

## Follow-up — the "too dark" pass (same day)

Marked-up screenshot of the Timeline editor: the empty track lanes, the text boxes and
the preview surround were circled as reading dead-black.

### `ed-well` was inverted

`ed-well` was `#0E0F12` — *below* `ed-base`. The theory was that inputs and empty lanes
should read as recessed holes. On a near-black ground a "hole" is just a darker hole, so
every text box and every empty lane vanished into the page. That one token backed ~40
form controls and 46 sites in `TimelineEditor` alone.

It now sits **between `surface` and `raised`** at `#17191D`, matching how the reference
treats an input — a raised card, lighter than what surrounds it. The ladder is now:

```
chrome #050507  <  base #0A0B0D  <  surface #131417  <  well #17191D  <  raised #1A1C20  <  hover #232529
```

Seven `bg-ed-well/50`-style fractional uses were normalised — at half strength over a now
lighter token they read inconsistently. Two of them were toolbar strips and moved to
`ed-raised`; the chat scroll region became `ed-base`, since it is a ground for bubbles
rather than an input. The timeline scroll container moved from `bg-ed-well/30` to
`bg-ed-base` so the lanes read as cards *on* a ground.

### The A1 narration bar was illegible

Both A1 renderings — the per-act blocks and the master-narration bar — were
`bg-gradient-to-r from-ed-accent to-ed-accent` with **`text-ed-accent-text` on top**.
Under violet that was light-violet-on-violet and merely poor; under mint it became
mint-on-mint at roughly 1.1:1, and it was the single loudest object in the editor.

A1 is the audio track and already had an unused identity colour. Both now use a tinted
`ed-a1` card (`bg-ed-a1/15 border-ed-a1/50 text-ed-a1`, stronger when selected). This
fixes the contrast, drops a large saturated block out of the timeline, and puts the
V1/A1/A2/OV identity system back to work.

### Not changed: the black around the preview

The black surrounding the portrait clip in the player is **not chrome** — it is
`backgroundColor: 'black'` at `VideoComposition.tsx:414`, i.e. the composition's own
background. It is pillarboxing that a 16:9 project applies to 9:16 footage, and it is
what exports. Lightening it would misrepresent the render and defeat the reason the
media well is neutral at all.

If those bars are unwanted, the fix is the project aspect ratio (portrait source in a
16:9 timeline), not the theme.

### Second follow-up — tabs and the A1 bar

- **Tab order is now Timeline · Scene Board · Thumbnails.** Timeline is the surface the
  editor opens on and the one users return to between every other task, so it reads as
  the home of the group rather than something tucked between two side trips. All three
  routes render the same `VideoTabs` component, so the order cannot drift.
- **Inactive tabs went from `text-ed-text-dim` to `text-ed-text`.** Dimmed labels beside
  a filled active tab read as disabled rather than as available; the group now matches
  the Media / Scene Info / Export set.
- **A1 narration is green again** — but as a tint (`bg-ed-accent/15`, `border-ed-accent/50`,
  `text-ed-accent`), not a solid fill. Solid mint with a mint label was the ~1.1:1 bug;
  solid mint with a dark label would have made a full-width bar the loudest object in
  the editor. The tint keeps the brand colour and a readable label.
- **Waveform strokes were hardcoded hexes** — `#9333ea` (violet-era leftover) on A1 and
  `#3b82f6` on A2. The plan-20 sweep could not see them because it matched Tailwind class
  names, not SVG attributes. All four are now `currentColor`, so each waveform follows
  its own clip's colour automatically.
- **The Auto-Captions knob was `bg-ed-surface`** (`#131417`) — a dark knob on a dark
  off-track, effectively invisible. It now inverts against whichever track it sits on:
  light when off, dark when on (over mint).

Brand logo hexes in `integrations/page.tsx` (YouTube red, TikTok black/white) are
deliberately left hardcoded.
