# 16 — Long-Form Audio-First Pipeline

**Status:** implemented (UI polish outstanding — see Follow-ups)
**Depends on:** `04-script-writer-and-generation-ui.md`, `07_AI_GENERATION_PLAN.md`, `03-native-agent-orchestration.md`
**Migration required:** `db/add-act-narration.sql` (and `db/add-act-persistence.sql`, if not already run)

---

## Why this exists

Long-form (10-30 min) generated act-by-act, but the workflow it needed to support —
**settle the writing and the audio first, then do visuals** — was blocked by four
problems found while tracing a 20-25 minute project end to end.

### 1. Long-form ran ~35-40% short

`resolveDurationProfile` defined a `targetWordCount` for every tier, but the Script
Writer's act-scoped branch dropped it and sent only `targetLineCount` — which was a flat
`{ min: 15, max: 25 }` **identical across all four long-form tiers**.

So a 25-30m project asked for exactly as much prose per Act as a 10-15m one. Runtime was
driven purely by `actCount`, and the "8th-grade reading level / one visible action per
line" rules pushed the model toward ~12-word lines. A 20-25m selection produced ~14
minutes.

### 2. Narration was one indivisible blob

`generateFullNarration` joined every scene into one string and made a single TTS call for
the whole video, writing one file to `video_projects.narration_url` — documented in
`remotion/types.ts` as *"the single master narration track, which always starts at frame
0"*. That meant:

- **Nothing to click.** V1 had ~150 selectable scene blocks; A1 was one poured slab.
- **Editing one word in Act 5 re-recorded all 25 minutes** and re-timed all ~150 scenes,
  including the ~130 the user never opened.
- **A failure at minute 18 of 22 lost everything.**
- **Cascading drift.** The Deepgram alignment walked a single cursor with a ±5-word
  search window across ~150 scenes. One mismatch — a dropped word, or "1945" spoken as
  "nineteen forty five" — shifted every later scene, with no resync point. Scenes in Act
  7 could silently desync because of a hiccup in Act 2.

Related: scenes were joined with a plain `" "` while the comment claimed "a natural pause
between each" — and the duration logic explicitly depended on that pause existing
("natively includes the TTS engine's silent pause"). There was no pause.

### 3. Visual prompts were built before the script was approved

`generateAct` ran agents 3-7 inline, so ~150 `final_video_prompt`s were written from a
draft the user had not signed off on. Measured from the code: the Visual Architect is
*"one call per scene"*, the Safety Officer likewise — **~300 provider calls for a
25-minute video**. With the free tier's 13-second rate limiter (`AI_MIN_CALL_INTERVAL_MS`,
5 req/min) that is **over an hour of throttled work**, discarded the moment any act was
rewritten.

### 4. The Casting Director was structurally defeated

Its own contract says it is *"the only agent that needs to see every scene at once"*, so
the image model *"cannot quietly restyle a character between scene 1 and scene 40"*.

But `enrichAndPersistScenes` was called **per act**, so casting ran once per act, each
time seeing only that act's ~17 scenes with no memory of the others. In a 25-minute video
the same character was re-invented in every chapter and visibly changed appearance
between acts. This was the most damaging of the four and the least visible.

---

## The three-phase model

```
WRITE  ──►  HEAR  ──►  [ APPROVE ]  ──►  SEE
script      per-act                      agents 3-7,
+ scenes    narration                    cast once across all acts
~19 calls   N TTS + N Deepgram           ~300 calls, on FINAL text
```

Narration is chunked **by act, not by scene** — 9 blocks, not 150. Scenes stay 6-12s on
V1; the audio track is chunky, because an act is the unit the user reviews and rewrites.

```
V1         [s1][s2][s3][s4][s5][s6][s7][s8][s9][s10]...   (~150 blocks)
A1         [=== ACT 1 ===][=== ACT 2 ===][=== ACT 3 ===]  (9 blocks)
```

**Ripple semantics.** A re-recorded act that runs longer pushes later acts later and
lengthens the video. Nothing is trimmed — forcing an act back into its old slot would cut
off the user's new words. Later acts keep their own audio and their own internal scene
durations; only their start offset moves.

**Scene rows exist from phase 1 on purpose.** They cost no provider calls — they are
database rows. They are where Deepgram writes durations, and they are what the user
reviews during the audio phase.

---

## What changed

### Word budget

| File | Change |
|---|---|
| `src/lib/ai/generation-rules.ts` | Added `WORDS_PER_NARRATION_LINE = 15` and `DurationProfile.wordsPerAct`. `buildLongFormProfile` now derives `wordsPerAct = targetWordCount / actCount` and derives `targetLineCount` from it, instead of hardcoding `{15, 25}` for every tier. |
| `src/lib/ai/script-writer.ts` | The `actOutline` branch of `lengthRule` now states the per-act word budget and instructs the model to write *richer lines*, not more lines. CRITICAL RULE 3 gained an explicit target line length so it stops fighting the word budget. |

Resulting targets:

| Tier | Acts | Total words | Words/act | Lines/act |
|---|---|---|---|---|
| 10-15m | 5 | 1500-2250 | 300-450 | 20-30 |
| 15-20m | 7 | 2250-3000 | 321-429 | 21-29 |
| 20-25m | 9 | 3000-3750 | 333-417 | 22-28 |
| 25-30m | 11 | 3750-4500 | 341-409 | 23-27 |

### Per-act narration

**`db/add-act-narration.sql`** — new `act_narrations` table, one row per
`(project_id, act_number)`, holding `audio_url`, `duration_seconds`, `start_seconds` and
act-relative `word_timings`. A table rather than a jsonb column because rows are written
one act at a time and a blob would let concurrent act writes clobber each other.

**`src/app/actions/audio-actions.ts`**
- `synthesizeAndAlign()` — extracted from `generateFullNarration`. Synthesises one block
  and aligns it. **The word cursor restarts per call**, which is the drift fix.
- `alignAudioToScenes()` — the Deepgram pass, now reusable and offset-free.
- `generateActNarration(projectId, actNumber)` — records and aligns one act, upserts its
  row. No other act is synthesised, transcribed, or read.
- `recomputeActLayout(projectId)` — running sum over act durations produces each act's
  `start_seconds`, and rebuilds the project caption track by offsetting each act's stored
  word timings. Pure arithmetic; **no second transcription on a ripple.**
- `getActNarrations(projectId)` — read the stored layout.
- `SCENE_SEPARATOR = "\n\n"` — the missing pause, now real.
- `generateFullNarration` retained unchanged in behaviour for short/mid-form.

**`src/app/actions/whiteboard-actions.ts`**
- `finalizeProjectScript` loops `generateActNarration` per act for long-form, then
  `recomputeActLayout`, and lands the project on `narrated`.
- `regenerateActNarration({ projectId, actNumber })` — re-records one act from its
  **current** `voice_over_beat` (never re-runs the Script Writer, so hand edits survive),
  re-runs the layout, and reports the shift in seconds so the user can re-align any
  fixed-position music or overlay clips.

### Approval gate

- `generateAct` no longer runs agents 3-7. It is now Script Writer + Scene Slicer only,
  which also makes act generation roughly 3× faster.
- `approveAndGenerateVisuals({ projectId, topic, visualAesthetic })` — reads every scene
  across every act, runs `castCharacters` **once** over all of them, then
  `enrichAndPersistScenes` with that shared cast. Resolves `nicheTheme` from the owning
  workspace when the caller does not supply it.
- `orchestrator.ts` / `orchestrator-actions.ts` accept optional pre-computed
  `blueprints`; when supplied, the per-call Casting Director is skipped.
- `PROJECT_STATUSES` gained `narrated` and `approved`.

### Path unification

`createAndGenerateVideo`'s long-form branch was a second, subtly different copy of the act
pipeline that **never stamped `act_number`** — so every project made that way was
permanently ineligible for `regenerateActVisuals`, per-act narration and per-act
re-record, all of which scope by that column. It now delegates to `generateAct`, and
persists `target_duration` and `act_outlines`.

`executeFullPipeline` returns early for long-form instead of firing a whole-project
narration, which would both pre-empt the review and produce the monolithic file this work
replaces.

### Timeline editor

- Loads `act_narrations`; their presence *is* the long-form signal.
- A1 renders one selectable block per act. Click to select, double-click to jump.
- Act inspector: jump to act, re-record this act, and a note that re-recording reads
  whatever wording is currently saved.
- Render payload: acts go through `audioClips` (each already wrapped in its own
  `<Sequence>` by `VideoComposition`), and `audioUrl` is left unset when acts exist — both
  populated would double-play, the hazard `CompositionAudioClip` warns about. **No
  stitching, and no ffmpeg dependency.**
- Editor playback: one hidden `<audio>` per act using the existing
  `data-start`/`data-duration` contract, so no new sync plumbing was needed.
- "Generate Full Narration" is hidden for long-form; "Approve & generate visuals" appears
  while status is `narrated`.
- Phase banner while in audio review.

### Concurrency

`SCENE_AGENT_CONCURRENCY` is now read from `AI_SCENE_CONCURRENCY` (default 1). Note the
real throughput gate is `AI_MIN_CALL_INTERVAL_MS` (13s default for the free tier's 5
req/min) — **raising concurrency alone changes nothing**; raise both together on a paid
tier.

---

## Before / after

| | Before | After |
|---|---|---|
| 20-25m project actually runs | ~14 min | 20-25 min |
| Narration on the timeline | one 25-min slab | 9 clickable act blocks |
| Edit one word in Act 5 | re-record 25 min | re-record ~2.5 min |
| Scenes re-timed by that edit | ~150 | ~17 |
| Scenes that can silently drift | ~133 | **0** |
| Visual prompts built from | unapproved draft | final approved text |
| Character look across 25 min | re-cast 9× — drifts | cast once — consistent |
| Act generation | 2-3 min/act | ~50 s/act |
| TTS failure at minute 18 | lose everything | lose one act |

---

## Verification

1. **Word budget** — generate 20-25m; assert ~333-417 words/act, `master_script` total
   3000-3750, narration 20-25 min. Repeat 10-15m to confirm the tiers now differ.
2. **Phase separation** — after generation every scene has `voice_over_beat` and **no**
   `final_video_prompt`; zero Visual Architect calls were made.
3. **Blocks** — 9 acts produce 9 selectable A1 blocks with contiguous `start_seconds`.
4. **Isolation (core test)** — record acts 1-4 and 6-9 audio URLs and scene durations.
   Edit an Act 5 scene, run `regenerateActNarration(5)`. Those acts' URLs and per-scene
   durations must be byte-identical; only Act 5's changed; Act 5 is still at index 5;
   acts 6-9 shifted by exactly Act 5's duration delta.
5. **Casting consistency** — after Approve, a character appearing in both Act 1 and Act 9
   carries an identical `appearance` string. Cannot be caught by a per-act test.
6. **Render** — export after a re-record: all acts audible, in order, no gap, overlap or
   double playback at boundaries.
7. **Captions** — words near an act boundary carry correct offsets, and stay correct after
   a ripple with no new Deepgram call.
8. **Drift** — the last scene of Act 9 has a sane duration.
9. **Migration absent** — without `add-act-narration.sql`, expect clear warnings, not a
   crash.
10. **No regression** — a "Short (< 60s)" project still uses single-pass
    `generateFullNarration` + single `audioUrl`.

---

## Follow-ups (not done here)

- **V1 placeholder blocks.** A phase banner was added, but individual V1 blocks are not
  yet styled as empty "awaiting visuals" placeholders.
- **Audio will not survive cloud rendering.** Files are written to `public/audio/` and
  referenced as `/audio/x.wav`. `CompositionAudioClip.src` requires a *server-fetchable*
  URL — a relative path is not one from AWS Lambda. Narration will silently vanish from
  exports when `10-aws-lambda-cloud-rendering.md` lands. Moving audio to Supabase storage
  fixes this and the ~85 MB of uncompressed WAV per project accumulating on disk.
- **No job queue.** A 9-act generation still runs inside one server action; a refresh
  loses in-flight work.
- **Voice pacing** (explicitly deferred by the user). `local-tts.ts` sends no `speed`
  field, so pace is whatever Kokoro defaults to. If speed becomes configurable,
  `NARRATION_WORDS_PER_MINUTE = 150` must become derived (`150 × speed`, plus pause time ×
  scene count) or the word budgets above will overshoot. Check `localhost:8880/docs` for
  whether `SynthRequestBody` accepts `speed`.
