# 19 — Scene Board Workspace

**Status:** implemented (Phases 0-4; typechecked and built via `npm run build` — not yet exercised against a real generation)
**Depends on:** `16-long-form-audio-first-pipeline.md`, `17-interleaved-per-act-audio-visual-approval.md`
**Migration required:** none — every field this plan surfaces is already written to the database and simply never rendered.

---

## Why this exists

The Scene Board is the only place you read your video before it exists, and it is the
weakest surface in the app. Not because of styling — because of five structural
problems that styling cannot reach.

### 1. The route already exists, and nothing links to it

`src/app/(dashboard)/workspaces/[slug]/videos/[videoId]/whiteboard/page.tsx` already
renders the board with the exact two-tab header the Thumbnails page uses. But a search
for navigation into it returns **nothing**:

- `TimelineEditor.tsx:4586` — header "Scene Board" button → `openSceneBoard()` (modal)
- `TimelineEditor.tsx:9041` — A1 right-click → `openSceneBoard()` (modal)
- `TimelineEditor.tsx:6142` — "Open Scene Board to write its script" → `openSceneBoard()` (modal)
- `TimelineEditor.tsx:4594` — Thumbnails → **`<Link href=".../thumbnails">`**

Thumbnails got a real tab. The Scene Board got a modal that shadows a dead route. That
asymmetry is exactly the thing that feels wrong.

### 2. A modal is the wrong container for this specific job

A modal is correct for a decision that takes ten seconds. Reviewing 150 scenes across
9 acts of a 25-minute video takes thirty minutes. The current modal actively fights
that:

- `max-w-4xl` on a 2560px monitor uses ~30% of the screen.
- Nested scroll — the backdrop scrolls (`overflow-y-auto`) and so does the page behind it.
- `my-auto` centering fights content taller than the viewport.
- Not deep-linkable, not refresh-safe, not openable on a second monitor, no browser back.
- It is no wider than the route it replaced, so the modal is strictly worse than the
  page already sitting unused in the codebase.

### 3. It is not a board — it is a form

`Whiteboard.tsx` is a single-column accordion of `<textarea rows={2}>`. There is no
image, no audio, no timing, no spatial layout. You cannot *see* your video anywhere in
the product that plans your video.

### 4. Split-brain: two Act UIs that point at each other

The real per-Act workflow from plans 16/17 — generate audio, approve visuals,
regenerate — lives in **TimelineEditor's right inspector** (`~5900-6150`). The Scene
Board still runs the superseded flow (`generateAct` → `finalizeProjectScript` →
"Approve & Open Timeline"). The result is circular:

- Timeline (`:6126`): *"This act has no script yet — generate it from the Scene Board first."*
- Scene Board: *"Approve & Open Timeline"*

Two different Act mental models in two different places. This is the root problem; the
visual design is downstream of it.

### 5. The data is already there and is being thrown away

The board renders 4 of roughly 15 fields it already holds. Written to the database by
the agent chain, never shown anywhere in the UI:

| Field | Written by | Currently visible? |
|---|---|---|
| `scenes.scene_type` | Agent 2 (Slicer) | partially — a small pill |
| `scenes.environment` | Agent 4 (Visual Architect) | **no** |
| `scenes.lighting` | Agent 4 | **no** |
| `scenes.camera_direction` | Agent 5 (Cinematic Director) | **no** |
| `video_projects.character_blueprints` | Agent 3 (Casting Director) | **no — nowhere in the app** |
| `scenes.media_id` / `custom_media_url` | render pipeline | timeline only |
| `act_narrations.audio_url` | plan 16 | timeline only |
| `act_narrations.duration_seconds` | plan 16 | timeline only |
| `act_narrations.word_timings` | plan 16 | renderer only |
| `scenes.generation_status`, `video_duration` | pipeline | timeline only |

The Casting Director is the agent that exists specifically to stop a character drifting
between scene 1 and scene 140 — and its output is invisible to the human who would
notice the drift.

---

## Recommendation

**Own route. Kill the modal.** `/scene-board` becomes a first-class sibling of the
Timeline and Thumbnails — three tabs, one header, consistent everywhere.

Rejected alternative — "keep the modal but style it better": every problem in section 2
is a property of being a modal, not of its CSS. Widening it to `max-w-7xl` still leaves
it un-linkable, un-refreshable, and nested-scrolling.

---

## The design

Desktop-only, full viewport, **no `max-width`**. Three panes.

```
┌ ← The Casino Clock Thing   [Scene Board] [Timeline] [Thumbnails]   24:31 / ~25:00  [Approve all] ┐
├─────────────┬─────────────────────────────────────────────────┬──────────────────────────────────┤
│  ACT RAIL   │  BOARD                                          │  INSPECTOR                       │
│   240px     │  fluid                                          │  340px                           │
│             │                                                 │                                  │
│ ▎Act 1      │  ── Act 2 · The Trap ──  2:47  ▶ ────────────    │  Scene 14 · ACTION               │
│  Cold Open  │  [Audio ✓] [Approve visuals] [Regen ⟳]          │  ┌──────────────────────────┐   │
│  ●●●● 2:12  │                                                 │  │                          │   │
│             │  ┌───────┐┌───────┐┌───────┐┌───────┐           │  │     scene preview        │   │
│ ▎Act 2      │  │  #12  ││  #13  ││ ▎#14  ││  #15  │           │  └──────────────────────────┘   │
│  The Trap   │  │ 4.5s  ││ 3.2s  ││ 5.0s  ││ 4.1s  │           │                                  │
│  ●●●○ 2:47  │  │"They…"││"With…"││"Your…"││"And…" │           │  NARRATION           saved ✓     │
│             │  └───────┘└───────┘└───────┘└───────┘           │  ┌──────────────────────────┐   │
│ ▎Act 3      │                                                 │  │ Your brain forgets how…  │   │
│  ●○○○  —    │  ── Act 3 · The Payoff ──  not recorded ──       │  └──────────────────────────┘   │
│             │  [Generate audio]                               │                                  │
│ ─────────   │                                                 │  VISUAL PROMPT                   │
│ CAST · 3    │  ┌───────┐┌───────┐                             │  A hypnotized-looking person…    │
│ ◍ Marcus    │  │  #29  ││  #30  │                             │                                  │
│ ◍ Dealer    │  │queued ││queued │                             │  ENVIRONMENT  casino floor, no…  │
│             │  └───────┘└───────┘                             │  LIGHTING     motivated neon…    │
│             │                                                 │  CAMERA       85mm, slow push-in │
│             │                                                 │  CAST         Marcus             │
└─────────────┴─────────────────────────────────────────────────┴──────────────────────────────────┘
```

### Left — Act rail (240px, sticky)

The spine of the video, and the answer to "where am I in 25 minutes?" that does not
exist today. Per act: number, title, a **four-dot pipeline meter** (Script → Audio →
Visuals → Approved), real duration from `act_narrations.duration_seconds`, scene count.
Click scrolls the board to that act. Below the acts, the **Cast strip** —
`character_blueprints` finally rendered, one row per character, expanding to appearance
/ wardrobe / demeanor.

### Center — the board (fluid)

Two view modes, toggled in the header:

- **Board** (default) — a wrapping grid of scene cards under sticky per-act headers.
  Card: 16:9 media thumbnail (or a typographic placeholder stamped with `scene_type`
  when there is no media yet), sequence number, duration pill, status ring, first line
  of narration. This is the part that makes it a board instead of a form.
- **Script** — a single reading column of narration only, act by act, with word count
  and estimated runtime. For when you are editing copy, not looking at pictures.

Each act's sticky header carries **the plan-17 controls** — generate audio, inline
player, approve visuals, regenerate visuals, re-record narration — calling the same
server actions the Timeline inspector calls today. This is what closes the split-brain.

### Right — Inspector (340px, sticky)

Everything about the selected scene: large preview, narration textarea with autosave
(`updateSceneVoiceover`, already exists), visual prompt, and the **agent breakdown** —
environment, lighting, camera direction — which the pipeline writes and nothing has
ever displayed. Plus which cast members appear in this scene.

---

## Features to add, ranked by payoff per unit of work

1. **Per-act and per-scene pipeline status.** Four-dot meter. Nothing today tells you at
   a glance which acts are finished. Pure presentation of existing state.
2. **Inline act audio playback.** `act_narrations.audio_url` is already stored and is
   playable nowhere but the timeline. Listen to Act 3 while reading Act 3's scenes.
3. **Karaoke scroll.** `act_narrations.word_timings` is stored per act and used only by
   the renderer. While an act plays, highlight the scene card currently being spoken.
   High perceived polish, near-zero cost — the data is sitting there.
4. **Cast strip.** Surfaces `character_blueprints`. This is the consistency contract for
   the entire video and it is currently invisible.
5. **Runtime vs target.** `targetDuration` is stored and never compared against. Header
   shows `24:31 / ~25:00` with a drift indicator.
6. **Per-scene fallback badges.** Today "42 scenes used the basic prompt" is one
   aggregate paragraph. Put the badge on the card so you can see *which*.
7. **Filter bar.** needs visuals · used fallback · failed · no media · no audio. At 150
   scenes this is the difference between usable and unusable.
8. **Keyboard navigation.** `j/k` scene, `←/→` act, `Space` play act, `Enter` edit
   narration, `Esc` blur, `/` search. Desktop-only means real shortcuts are safe.
9. **Narration search.** `Cmd+K` to find a line inside a 25-minute script.
10. **Reorder / split / merge scenes.** Deferred — the board is the right eventual home,
    but it touches `sequence_number` bookkeeping and belongs in its own plan.

---

## Visual direction

Current chrome — white cards, `gray-200` borders, `rounded-2xl`, `purple-600` accent —
is clean but generic, and at `max-w-4xl` with `space-y-5` / `p-6` it wastes most of a
wide monitor.

**Recommendation: dark canvas, light rails.** The board pane goes `neutral-950`; the act
rail and inspector stay light. This is the Figma / Premiere / Frame.io convention and it
exists for a reason — thumbnails read as *images* against dark and as *cards* against
white. Keep purple as the single brand accent and add a semantic status set:

| State | Color |
|---|---|
| Approved | `emerald-500` |
| Audio ready, visuals pending | `sky-500` |
| Generating | `purple-500` |
| Used fallback prompt | `amber-500` |
| Failed | `red-500` |
| Queued | `neutral-600` |

Density: drop `max-width` entirely, tighten to an 8px rhythm, `rounded-xl` not
`rounded-2xl`, and let the grid reflow to viewport width.

*Built as the dark canvas.* The all-light alternative matches the rest of the app more
literally, but a scene board is a viewing surface, not a settings page.

---

## Phases

**Phase 0 — route and wire-up.** Rename `whiteboard/` → `scene-board/`. Three-tab header
shared by all three pages. Delete the Scene Board modal from `TimelineEditor` (removes
~85 lines, the `dynamic()` import, 5 state vars, the Escape-layer branch at `:3432`, and
the `openSceneBoard` fetch/cache at `:3469`). All three current entry points become
`<Link>`s. *After this phase alone the board is already better, because it is finally
the route instead of the modal.*

**Phase 1 — layout shell.** Three panes, full viewport, act rail, sticky act headers,
board/script toggle.

**Phase 2 — scene cards and inspector.** The visual payoff. Media thumbnails, status
rings, agent breakdown.

**Phase 3 — fold in per-act controls.** Audio generation, visual approval, regeneration
called directly from the act headers. Closes the split-brain.

**Phase 4 — the rest.** Cast strip, runtime vs target, filters, keyboard, karaoke.

---

## Risks and open questions

- **`TimelineEditor.tsx` is 9,229 lines** and owns the act handlers (`:698` approve,
  `:719` regen visuals, `:770` regen narration). Do **not** try to share client state
  between the two surfaces. Both should call the server actions directly — that is
  already the boundary, and the Scene Board reloading from the DB on navigation is
  correct behavior, not a compromise.
- **`finalizeProjectScript` vs per-act approval.** The board's current "Approve All"
  predates plan 17. Keep it, rebadged as "Approve all remaining acts" — a batch
  convenience over the per-act primitive, not a competing path.
- **Open question, not assumed here:** should the Scene Board become the *primary*
  post-generation destination, with the Timeline demoted to fine-tuning? The content
  argues yes. That is a navigation-hierarchy decision worth making deliberately rather
  than as a side effect of this plan.
- The board must stay correct when migrations have not run — `act_narrations` and the
  agent columns can all be absent. Same degradation convention as
  `loadProjectForWhiteboard`: a missing table reads as "no audio yet", never an error.
