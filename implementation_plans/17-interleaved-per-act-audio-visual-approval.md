# 17 — Interleaved Per-Act Audio + Visual Approval

**Status:** implemented (built, typechecked, built end-to-end via `npm run build` — not yet exercised against a real generation)
**Depends on:** `16-long-form-audio-first-pipeline.md`
**Migration required:** none new — reuses `character_blueprints`, `act_outlines`, `act_narrations`, and scene columns already in place from plan 16.

---

## Why this exists

Plan 16 split long-form generation into three phases — write, hear, see — but shipped
with two bulk steps still in the middle of the "hear" and "see" phases:

- `finalizeProjectScript` narrated **all 9 Acts in one action**, with no pause.
- `approveAndGenerateVisuals` built prompts for **the whole project at once**.

Individually re-recording or re-approving one Act only worked *after* that first bulk
pass had already run. The user wanted finer control: record Act 1's audio, listen to
it, approve Act 1's visuals, *then* move to Act 2 — repeating per Act, in whatever
order, never running all 9 Acts' audio+visual pipeline unattended.

Two things already sitting in the plan-16 code needed fixing to make that safe:

1. **No per-Act audio entry point existed in the UI.** `generateActNarration` (the
   server action) already worked per-Act, but nothing called it except the bulk loop
   inside `finalizeProjectScript`.
2. **An older button was still live** in `Whiteboard.tsx` —
   `handleRegenerateVisuals` → `regenerateActVisuals` — that ran the Casting Director
   **fresh, scoped to one Act**, un-gated by whether narration even existed yet. That
   is the exact cross-Act character-drift bug plan 16's global-cast fix was built to
   eliminate, still reachable from the UI.

## Confirmed scope

- Scripts still auto-write for all N Acts up front (`runAllActs` in `Whiteboard.tsx`,
  unchanged) — cheap, fast, and the user is fine with it.
- Audio and visuals interleave per Act: Act 1's visuals can be approved before Act 2's
  audio exists.

## The fix: cast once, early, shared by every later approval

Characters are cast **once**, right after all N scripts exist (before any Act has
audio), persisted, and every Act's visual approval — whenever it happens, in whatever
order — draws from that one stored cast instead of recomputing it.

```
Whiteboard          Timeline Editor (per-Act, any order)
─────────────       ─────────────────────────────────────
write all N     →   Act 1: audio → approve visuals
scripts             Act 5: audio → approve visuals   (2-4, 6-9 still untouched)
cast ONCE           Act 9: audio → approve visuals
status: scripted    Act 2: audio → approve visuals
                     ...
                     status flips to 'approved' once every Act is done
```

## What changed

### `src/app/actions/whiteboard-actions.ts`

- **`resolveWorkspaceNicheTheme(supabase, projectId, provided?)`** — extracted shared
  helper. The Timeline Editor has no workspace-theme prop; this resolves it via the
  same join `approveAndGenerateVisuals` used inline before.

- **`castProjectCharactersOnce({ projectId, topic, visualAesthetic, nicheTheme? })`**
  — the core new primitive. Self-healing by construction: `character_blueprints`
  (jsonb, no default, so `null` until written) *is* the "has casting run" flag. Reads
  it; if set, returns it; if not, casts across every scene in the project and
  persists. Calling this before every Act exists, or calling it twice, still produces
  exactly one consistent cast.

- **`finalizeProjectScript`** — trimmed for long-form. No longer loops
  `generateActNarration`. Now: stitch `master_script`, call
  `castProjectCharactersOnce` once, set status to **`'scripted'`** (new). This is
  where the Whiteboard hands off to the Timeline Editor. Short/mid-form branch is
  untouched.

- **`approveActVisuals({ projectId, actNumber, topic, visualAesthetic, nicheTheme? })`**
  — new per-Act visual primitive. Resolves niche once, calls
  `castProjectCharactersOnce` (no-op if already cast), reads only this Act's scenes,
  runs `enrichAndPersistScenes` (agents 4-7) with the shared cast. After writing,
  checks whether every scene in the *whole project* now has `environment` set — if so,
  flips project status to `'approved'`. This derivation is what lets "every Act
  approved" be detected without a separate counter that could drift.

- **`approveAndGenerateVisuals`** — reimplemented as a thin loop over
  `approveActVisuals` for whichever Acts are still missing visuals (derived by
  querying scenes for `environment IS NULL`, grouped by `act_number`). Kept as the
  "finish the rest in bulk" option for someone who's reviewed every Act's audio and
  just wants the remainder done without clicking through each one.

- **`regenerateActVisuals`** — same one-line fix as `approveActVisuals`: now resolves
  niche and calls `castProjectCharactersOnce` instead of casting fresh. Same bug, same
  fix, wherever it's called from.

- **`regenerateActNarration`** — now explicitly documented and used for **both**
  first-time recording (from an empty placeholder block) and re-recording (an Act that
  already has audio) — both are the same underlying call. The "Act is now longer/
  shorter" ripple warning is suppressed on a first-time recording (there is no
  previous state to have shifted from).

### `src/components/ui/Whiteboard.tsx`

- Removed `handleRegenerateVisuals`, its state, and its per-Act card button. Visual
  work no longer belongs in the Whiteboard under this design — it starts only after
  `'scripted'`, which is where the Whiteboard's job ends. `updateSceneVoiceover`
  inline editing stays; that's how the user fixes wording before locking in a cast.
- `handleApproveAll` now passes `topic`/`visualAesthetic` through to
  `finalizeProjectScript` so casting has what it needs.

### `src/lib/timeline-types.ts`

- Added `'scripted'` to `PROJECT_STATUSES`, between `'drafting'` and `'narrated'`.
  Documented precisely because its meaning is easy to get wrong: it is **not** a
  whole-project completion marker the way `narrated`/`approved` are — individual Acts
  progress through audio and visuals independently after this point, tracked on
  `act_narrations` rows and each scene's `environment`, not on this single
  project-level field. `'narrated'` is now short/mid-form only; long-form goes
  straight from `'scripted'` to `'approved'`.

### `src/app/(dashboard)/workspaces/[slug]/page.tsx` + `TimelineEditor.tsx` status chips

Both status-badge maps gained a `'scripted'` case ("Ready To Narrate" / purple, same
family as the audio-review badge) so the new status doesn't fall through to generic
"Draft" styling.

### `src/components/ui/TimelineEditor.tsx` — the actual workflow

- **`isLongForm`** — derived from `resolveDurationProfile(initialProject.target_duration)`,
  independent of whether any Act has narration yet. This is the fix for the core UX
  gap: previously `hasActNarration` (= `actNarrations.length > 0`) gated whether A1
  showed Act blocks at all, so right after the Whiteboard hands off — zero Acts
  narrated — A1 showed nothing.
- **`actOutlines`** — read from `initialProject.act_outlines` (persisted at project
  creation since plan 16). This is what lets A1 draw a block for Act 7 before Act 7
  has ever been recorded.
- **`actVisualState`** / **`actSummaries`** — derived, memoized state merging the
  outline (always present), narration (if any), and per-Act visual-approval counts
  (`environment IS NOT NULL`, counted per `act_number` from the already-loaded `scenes`
  array). Both the A1 track and the Act inspector read from this one derived
  structure, so they can never disagree about an Act's state.
- **A1 track** — now renders one block per outline entry, in two visual states:
  narrated (existing waveform look, now also showing a check icon once visuals are
  approved) or **not yet recorded** (dashed border, mic icon, click to record — reuses
  the existing `handleRegenerateAct`, since first-time recording and re-recording are
  the same underlying call). Placeholder blocks are positioned sequentially after the
  narrated tail using a fixed layout width — not a real duration, just enough to read
  as a distinct clickable block.
- **Act inspector** — extended with a "Visuals" section: an "Approve this act's
  visuals" button when not yet approved (with a note when some scenes already have
  visuals from a prior partial attempt), or an approved state with "Regenerate this
  act's visuals" once done.
- **V1 placeholder styling** — scenes with `environment == null` (long-form only) now
  render a diagonal-hash "Awaiting visuals" overlay, `pointer-events-none` so it never
  intercepts the block's existing click/drag/resize handlers. This was flagged as a
  cosmetic follow-up in plan 16; under interleaved per-Act approval it became
  load-bearing — it's the only visual signal of which Acts are done when Acts can be
  approved out of order.
- Legacy single-file paths (`!hasActNarration` gates) were tightened to `!isLongForm`
  throughout — the bulk "Generate Full Narration" button, the per-scene `<audio>`
  fallback, the phase banner, and the project-panel summary. `!hasActNarration` was
  the wrong signal once "long-form with zero Acts narrated yet" became a real, common
  state instead of a brief transitional one.
- Phase banner and project-panel copy updated to describe the interleaved workflow
  ("N of M acts narrated · click an act on A1 to record, re-record, or approve its
  visuals — in any order") instead of implying a single all-or-nothing audio phase.

## Verification

1. **Cast timing** — after the Whiteboard's Approve (script) button, `character_blueprints`
   is populated and no Act has been narrated yet.
2. **Interleaving works** — generate Act 1 audio, approve Act 1 visuals, confirm Acts
   2-9 have neither audio nor visuals, then generate Act 2 audio.
3. **Consistency holds under interleaving** — approve Act 1's visuals, then Act 9's,
   with Acts 2-8 still un-narrated in between. A shared character's `appearance`
   string in Act 1 and Act 9 must match — this is the scenario the old per-Act casting
   bug would fail and the plan-16 global-only approve couldn't even exercise.
4. **`regenerateActVisuals` reuses the cast** — call it on an already-approved Act;
   confirm no new Casting Director call happens (same blueprint set before and after).
5. **Bulk fallback still works** — with some Acts approved and some not,
   `approveAndGenerateVisuals` only touches the un-approved ones and reuses the same
   cast.
6. **No regression** — short/mid-form projects still go straight to `'narrated'` with
   inline visuals, untouched by any of this.

Confirmed so far: `npm run build` compiles clean (TypeScript + Turbopack), and
`npx tsc --noEmit` is clean across the whole project. Not yet run against a live
generation — no Gemini/Voice-Studio keys configured in this environment (mock mode is
deliberate; see memory).

## Known gap found while building this, out of scope here

`generateAct` (plan 16) skips agents 3-7 unconditionally — including for short/mid-form
projects created via the Whiteboard (`isSinglePass: true`). Short/mid-form's
`finalizeProjectScript` branch only narrates; nothing calls `enrichAndPersistScenes`
for those projects afterward. `NewVideoForm.tsx` routes through `<Whiteboard>` for all
durations, so **short/mid-form projects created through the primary "New Video" form
may never get a visual pass** — they'd sit at `'narrated'` with `final_video_prompt`
still holding the Scene Slicer's raw, un-enriched prompt. This predates this plan (it
was introduced by plan 16's unconditional removal of agents 3-7 from `generateAct`) and
is outside its scope. Needs its own investigation: either restore an inline visual pass
for `isSinglePass` projects specifically, or give short/mid-form the same explicit
approve step long-form now has.
