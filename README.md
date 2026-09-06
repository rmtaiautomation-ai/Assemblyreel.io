# AssemblyReel — AI long-form video generation pipeline

AssemblyReel turns a **topic** into a finished **long-form narrated video** (10–30+ minutes,
up to multi-hour) through a controlled, reviewable pipeline: it writes the script act by act,
records and time-aligns the narration, casts recurring characters once so they stay
consistent, designs every shot, generates or selects the visuals, lays them on a
browser-based timeline, and renders the final MP4 with Remotion — locally or on AWS Lambda.

It is built for **faceless channel production at scale**: one channel's voice, structure,
pacing, and citable sources are captured as editable data (a "Channel Blueprint"), so
video 1 and video 100 come off the same machine, and launching a second channel in a
different niche is a settings change, not a code fork.

---

## Table of contents

- [What it produces](#what-it-produces)
- [Tech stack](#tech-stack)
- [System overview](#system-overview)
- [The generation pipeline (the process)](#the-generation-pipeline-the-process)
  - [Stage 0 — Channel setup](#stage-0--channel-setup)
  - [Stage 1 — Project creation and act outlining](#stage-1--project-creation-and-act-outlining)
  - [Stage 2 — Script writing](#stage-2--script-writing)
  - [Stage 3 — Scene slicing](#stage-3--scene-slicing)
  - [Stage 4 — Audio-first narration](#stage-4--audio-first-narration)
  - [Stage 5 — Per-act human approval](#stage-5--per-act-human-approval)
  - [Stage 6 — The visual agent pipeline](#stage-6--the-visual-agent-pipeline)
  - [Stage 7 — Media generation](#stage-7--media-generation)
  - [Stage 8 — Timeline editor](#stage-8--timeline-editor)
  - [Stage 9 — Render](#stage-9--render)
- [Long-form generation model](#long-form-generation-model)
- [Channel configuration](#channel-configuration)
- [The video engine (Remotion)](#the-video-engine-remotion)
- [Rendering architecture](#rendering-architecture)
- [Data model](#data-model)
- [Repository map](#repository-map)
- [Running locally](#running-locally)
- [Scripts and tooling](#scripts-and-tooling)
- [Operating model and current status](#operating-model-and-current-status)

---

## What it produces

- **Long-form narrated documentaries**, generated one *Act* (chapter) at a time so a
  25-minute video is produced, reviewed, and corrected in ~2.5-minute units rather than as
  one monolithic pass.
- **Word-accurate captions**, produced by force-aligning the generated narration audio
  back to the script with Deepgram.
- **Visually consistent casts** — recurring characters are described once and that
  description is threaded into every shot prompt, so a subject cannot drift in appearance
  between chapter 1 and chapter 9.
- **Per-scene cinematic prompts** for an image/video model, assembled from environment,
  lighting, camera, character, and channel-style inputs and passed through a safety-rewrite
  pass so they clear commercial content filters.
- **An editable timeline** — kinetic-text overlays, graphic-card templates, atmospheric
  effect layers, transitions, Ken Burns motion, per-act audio blocks — before a final
  Remotion render to MP4.

---

## Tech stack

| Layer | Choice |
|---|---|
| App framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database / auth | Supabase (PostgreSQL, row-level security) |
| Text generation | OpenAI via the Vercel AI SDK (`ai`, `@ai-sdk/openai`) — every LLM call: the agent pipeline, scene slicer, long-form script writer, brainstorm co-writer |
| Image generation | Google Gemini image API (`@google/genai`) |
| Video / B-roll generation | Provider registry — Fal.ai (Seedance / Kling / Veo routing), with stock-footage (Pexels / Pixabay) and a deterministic **mock** provider as fallbacks |
| Text-to-speech | Runtime-selected: OpenAI `gpt-4o-mini-tts`, ElevenLabs, or a local Voice Studio (Kokoro) HTTP service — chosen by `TTS_PROVIDER` |
| Forced alignment | Deepgram (word-level timings for captions and scene durations) |
| Video engine | Remotion 4 (`@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/lambda`) |
| Cloud rendering | AWS Lambda + S3 (`@remotion/lambda`, `@aws-sdk/client-s3`) — opt-in; local render is the default |
| Billing | Stripe |

**Provider abstraction.** Media backends sit behind `src/lib/ai/providers/registry.ts`.
With no video-provider keys set, the registry resolves to `providers/mock.ts` — a working
state that lets the whole pipeline run end to end without paid API calls. TTS providers are
interchangeable behind a common `generate…SceneSpeech` signature so `audio-actions.ts` can
switch engine per call.

---

## System overview

```
                          ┌─────────────────────────────────────────────┐
  CHANNEL SETUP           │  Channel Blueprint  +  Channel Fact Ledger    │
  (once per channel)      │  register · delivery · act cycle · required   │
                          │  beats · visual grammar · verified sources    │
                          └───────────────────────┬─────────────────────┘
                                                  │ frozen onto each project at creation
                                                  ▼
  PER VIDEO      topic ─► Act Outliner ─► Script Writer ─► Scene Slicer ─► Narration (per act)
                             (N acts)      (per act)        (rows only)     TTS + Deepgram align
                                                                                  │
                                                                                  ▼
                                                                        ┌──────────────────┐
                                                                        │  HUMAN APPROVAL  │  ◄── per act, any order
                                                                        │  hear → approve  │
                                                                        └────────┬─────────┘
                                                                                 ▼
                cast once (all acts) ─► Visual Architect ─► Prompt Assembler ─► Safety Officer
                                        + Cinematic Dir.     (pure compile)     (filter-safe rewrite)
                                                                                 │
                                                                                 ▼
                                          Media generation (image / video / stock / mock)
                                                                                 │
                                                                                 ▼
                                       Timeline Editor  ─►  Remotion render  ─►  MP4
                                       overlays · cards · FX      local  |  AWS Lambda
```

Because the app runs on a single machine with no serverless request-timeout, the pipeline
is a **plain sequential `await` chain** — no job queue, no worker process. Throughput is
governed by a shared rate limiter (`AI_MIN_CALL_INTERVAL_MS`) rather than concurrency.

---

## The generation pipeline (the process)

Entry points: `createProjectWithActs` → `generateAct` (×N) → `finalizeProjectScript`
(`src/app/actions/whiteboard-actions.ts`), then per-act narration and approval from the
timeline editor. `createAndGenerateVideo` (`video-actions.ts`) is the one-call variant that
delegates to the same `generateAct`.

### Stage 0 — Channel setup

Done once per channel, in **Workspace Settings** (two real tabs: **Channel Format** and
**Facts**).

1. **Channel Format.** The user pastes research notes about the channel/niche. The
   **Format Analyst** agent (`agents/format-analyst.ts`) translates that prose into a typed
   `FormatProfile` — narrator persona, register, forbidden registers, words-per-minute,
   TTS voice settings, the **act cycle** (the beats every Act must contain, in order),
   cold-open rules, required beats (e.g. "personal-stake by Act 2", "verbatim citation"),
   sourcing rule, a pool of **rotating framing devices**, and visual grammar (style tag,
   preferred shot types, still treatment, evidence-card format). Gaps are returned as
   questions rather than silently defaulted. The tab shows a per-field "modified from
   preset" badge and a live preview of the exact Script Writer instruction that will be
   sent.
2. **Facts.** The same paste is mined **concurrently** by the **Fact Archivist**
   (`agents/fact-archivist.ts`) for citable named sources — scholars, councils,
   manuscripts, years. Every row lands `verified: false`; only rows a human ticks are
   compiled into the prompt. Doubtful/unfalsifiable items are flagged and sorted to the
   top. The compiled `NAMED SOURCES` block ends with an escape hatch ("write the claim
   unattributed — 'a fourth-century council' — and move on") so the writer never invents a
   citation to fill a beat.

Five built-in presets ship (`forensic-documentary`, `mythic-epic`,
`grounded-investigation`, `dark-psychology`, `general`) so a new workspace is never blank.

### Stage 1 — Project creation and act outlining

`resolveDurationProfile` (`generation-rules.ts`) maps the chosen target duration to a
**duration tier**:

| Target | Tier | Acts | Total words | Words/act | Scene length | Generation |
|---|---|---|---|---|---|---|
| < 60s | short-form | 1 | 75–150 | 75–150 | 2–4s | single pass |
| 2–3m | mid-form-short | 3 | 300–450 | 300–450 | 4–6s | single pass |
| 4–5m | mid-form-long | 3 | 600–750 | 600–750 | 5–8s | single pass |
| 10–15m | long-form | 5 | 1500–2250 | 300–450 | 6–12s | act-by-act |
| 15–20m | long-form | 7 | 2250–3000 | ~320–430 | 6–12s | act-by-act |
| 20–25m | long-form | 9 | 3000–3750 | ~330–420 | 6–12s | act-by-act |
| 25–30m | long-form | 11 | 3750–4500 | ~340–410 | 6–12s | act-by-act |

Per-request word budgets are derived as `total ÷ actCount` and the model is told to write
*richer lines*, not more lines — the fix for long-form runs that used to land 35–40% under
their target.

The **Act Outliner** (`generateActOutlines`) then breaks the narrative arc into exactly
`actCount` Acts, each with a title and a 2–3 sentence retention brief, using the channel's
`structure.actCycle` applied **once per Act** (not once per video). The resolved
`FormatProfile` and fact ledger are **frozen** onto the project row at this point
(`format_blueprint_snapshot`, `channel_facts_snapshot`) — later edits to the channel
settings cannot change the rules an already-approved Act was written under.

### Stage 2 — Script writing

`generateScript` runs **once per Act** for long-form (once total for short/mid). The system
instruction is compiled from the frozen `FormatProfile` by `format-prompt.ts`:
register/persona, act-cycle beats placed for *this* Act number, verified named sources,
a **continuity block** of what earlier Acts already covered, the selected rotating framing
device for this video, and the length rule. Output is a JSON array of spoken lines; a
cleaning pass strips markdown artefacts, stray slashes, doubled punctuation.

### Stage 3 — Scene slicing

The **Scene Slicer** (`slicer-actions.ts`) chops each Act's script into scenes of the
tier's target length. Every scene gets: the exact verbatim text chunk, a first-pass visual
prompt, an estimated spoken duration (computed at the channel's actual words-per-minute,
not a fixed 150), and a **scene type** (`ESTABLISH` / `ACTION` / `DIALOGUE` / `DIVINE` /
`CLOSEUP` / `MACRO` / `WIDE`) biased by the channel's preferred shot types. Scenes are
written as database rows immediately — they cost no API calls and are the unit the user
reviews during the audio phase.

### Stage 4 — Audio-first narration

Narration is chunked **by Act** (≈9 blocks), never by scene (≈150).

- `generateActNarration(projectId, actNumber)` synthesises one Act's audio via the selected
  TTS provider and force-aligns it with Deepgram. **The alignment cursor restarts per
  Act**, so a dropped word or a "1945" spoken as "nineteen forty-five" can only desync that
  Act — never the whole video.
- Deepgram's word timings are written back as each scene's real duration and as the
  project caption track.
- `recomputeActLayout` produces each Act's start offset by a running sum and re-derives the
  caption track by offsetting each Act's stored word timings — **pure arithmetic, no second
  transcription** when an Act is re-recorded.
- **Ripple semantics.** Re-recording Act 5 longer pushes Acts 6–9 later and lengthens the
  video; nothing is trimmed, later Acts keep their own audio and internal scene durations,
  only their start offset moves. The shift in seconds is reported back so fixed-position
  music or overlays can be re-aligned.

### Stage 5 — Per-act human approval

The **Act inspector** in the Timeline Editor is the real approval gate. For each Act, in
any order: **record audio → listen → approve visuals**. Act 1's visuals can be approved
before Act 2's audio exists. A per-Act checklist renders the channel's `actCycle` +
`requiredBeats` directly above the approve button. Project status flips to `approved`
automatically once every scene in the project has visuals — derived, not counted.

### Stage 6 — The visual agent pipeline

Runs only on **approved** text. Orchestrated by `enrichScenesWithVisualPrompts`
(`orchestrator.ts`):

| # | Agent | Role |
|---|---|---|
| 1 | Script Writer | (Stage 2) |
| 2 | Scene Slicer | (Stage 3) |
| 3 | **Casting Director** | Reads **every scene across every Act at once** and locks a rigid blueprint (appearance / wardrobe / demeanor) for each recurring subject. Cast **once per project** and shared by every later Act approval — this is what stops characters drifting between chapters. |
| 4+5 | **Visual Architect + Cinematic Director** | One call per scene: environment, lighting, and a concrete camera instruction (lens + height + movement), decided together. |
| 6 | **Prompt Assembler** | Pure TypeScript, no LLM. Compiles subject + style tag + environment + lighting + camera into a single ~120-word prompt, ordered by importance so a dense scene sacrifices the right details first (`trimToWordBudget` drops from the tail). |
| 7 | **Safety Officer** | Minimal rewrite to clear a commercial NSFW/violence filter while preserving cinematic intent ("bloody knife" → "glistening steel in dim light"). Protects generation throughput; the provider still enforces its own policy. |

Every stage **degrades with a warning rather than aborting** — a casting failure loses
cross-scene consistency but scenes still render; a failed visual pass falls back to the
slicer's prompt; a skipped safety pass sends the prompt through unmodified and flags it.
The enriched `final_video_prompt` is a required write; the explanatory metadata
(environment / lighting / camera) is best-effort behind a hand-run migration.

### Stage 7 — Media generation

`final_video_prompt` goes to the resolved media provider. Generated clips and images are
**downloaded to `public/media/` on completion** rather than left pointing at a provider CDN,
so a project edited over several sessions can't lose an asset to link rot. Stock footage
(Pexels / Pixabay) is an approved-pick flow. With no keys, the mock provider returns
deterministic placeholders.

### Stage 8 — Timeline editor

A bespoke browser editor (`src/components/ui/TimelineEditor.tsx`): drag/trim scenes at any
zoom, an independent overlay (OV) track, per-act audio blocks with waveform display,
transition and Ken Burns controls, a blocking export overlay wired to real render progress.
See [The video engine](#the-video-engine-remotion).

### Stage 9 — Render

`src/app/api/render-remotion/route.ts` bundles the Remotion project and renders. Local
rendering runs inline with the machine's Chromium; AWS Lambda rendering is opt-in and
selected automatically when configured. See [Rendering architecture](#rendering-architecture).

---

## Long-form generation model

The three-phase split — **WRITE → HEAR → SEE** — exists because the earlier "generate
everything at once" path had four structural faults, all found tracing a real 20–25 minute
project:

| Fault | Consequence | Fix |
|---|---|---|
| Per-Act word budget dropped; line target flat across all tiers | Every long-form tier ran ~35–40% short regardless of the duration picked | `wordsPerAct = totalWords ÷ actCount`, line count derived from it |
| Narration was one indivisible TTS blob written to one file | Editing one word re-recorded 25 minutes and re-timed ~150 scenes; a failure at minute 18 lost everything | Per-Act `act_narrations` rows; synthesize/align one Act at a time |
| Deepgram alignment walked one cursor across ~150 scenes | One mismatch in Act 2 silently desynced every later scene | Cursor **restarts per Act** — 0 scenes can cross-desync |
| Casting Director called per-Act | Same character re-invented every chapter, visibly changing appearance | Cast **once** across all Acts, persisted, shared by every approval |

Numbers, before → after: a 20–25m project actually runs ~14 min → 20–25 min; timeline
narration is one slab → 9 clickable Act blocks; editing one word re-records 25 min → ~2.5
min; scenes that can silently drift ~133 → **0**; Act generation ~2–3 min → ~50 s.

`character_blueprints` (jsonb, null until written) *is* the "has casting run" flag —
`castProjectCharactersOnce` reads it, casts if unset, persists. Calling it before every Act
exists, or twice, still yields exactly one consistent cast (self-healing by construction).
The same pattern freezes the format snapshot and the fact-ledger snapshot.

---

## Channel configuration

### Three-layer resolution

```
per-video override  →  workspace blueprint (diff only)  →  built-in preset  →  hardcoded default
```

The workspace stores **only the diff** from its preset (`workspaces.format_blueprint`);
`format-profile-diff.ts` reduces the settings form back to that shape and `resolveFormatProfile`
deep-merges it over the preset per field.

### Freeze, don't just version

Every project stores a **full resolved copy** of the blueprint that produced it
(`video_projects.format_blueprint_snapshot` + version). A video is reproducible after the
channel format changes, with no join — and when video 43 outperforms, the exact format that
made it is on the row. `resolveProjectFormatProfile` is the single resolver every
generation call goes through; `generateAct`, `castProjectCharactersOnce`,
`approveActVisuals`, `approveAndGenerateVisuals`, `regenerateActVisuals` all read the
snapshot, never the live workspace row.

### `FormatProfile` shape

`identity` (narratorPersona, register, forbiddenRegisters) · `delivery` (wordsPerMinute,
ElevenLabs stability/similarity/style, localTts.speed, pauseBeforeRevelationMs,
quotationStyle) · `structure` (actCycle, coldOpen rules, terminalRevelation,
reHookIntervalSeconds, closer) · `content` (lineComposition `camera-ready | documentary`,
readingLevel, requiredBeats, sourcingRule, rotatingDevices, rotationWindow) · `visual`
(visualBias, promptStyleTag, preferredSceneTypes, stillTreatment, evidenceCardFormat) ·
`additionalDirection` (freeform escape hatch, appended last).

### Fact ledger

`kind`-typed rows (person / council / manuscript / event / …) so the compiled block groups
the pool and the model reaches into the right group. `always_use` splits the fixed opening
citation frame from the draw-on-demand pool. `verified` is the gate — `addExtractedFacts`
writes `verified: false` itself rather than trusting its caller.

### Rotation ledger

`workspaces.rotation_cursor` + `selectRotatingDevice(profile, cursor)` (pure, wraps) +
`consumeRotationCursor(projectId)` (never throws). `generateAct` consumes a cursor only
when the device pool is non-empty and passes the pick to the Script Writer as a mandatory
"build around this device" instruction — the mechanism that stops 27 videos opening the
same way.

---

## The video engine (Remotion)

`src/remotion/` — `index.ts` is the bundler entry (loaded **by string path** from the
render route; do not rename). One composition, `MainVideo` (`compositions/VideoComposition.tsx`),
registered in `Root.tsx` with a `calculateMetadata` that shares `layoutScenes` with the
editor so the `<Player>` and the render agree on total frames exactly.

- **Timeline math** (`timeline.ts`) — one `layoutScenes()` function is the single source of
  truth for scene frame math. A scene with an incoming transition starts `D` frames early
  **and** runs `D` frames longer, so `(from − D) + (duration + D) === from + duration`: the
  end frame, every later scene's start, and the total length are all unchanged. This is
  what lets transitions exist without drifting the picture against the master narration
  track, which is pinned at frame 0. Transition length is clamped to
  `floor(min(prev, next) / 2)` (the Premiere/CapCut rule).
- **Overlays** (`overlays/`) — kinetic-text presets: Slide, Pop-In, Typewriter,
  Lower-Third, plus per-word/per-character presets Cinematic-Reveal, Line-Wipe,
  Letter-Collapse, Chapter-Card.
- **Graphic-card templates** (`templates/`) — Checklist card, Title-cutout card, list
  templates (Evidence list, Ledger, Numbered stack, Side rail, Tick sheet), title
  templates (Broadcast bar, Dossier stamp, Quote card, Serif plate, Stack wipe), behind a
  style registry that renders a **visible marker** for an unknown style rather than a
  silent substitute.
- **Environmental effect layers** — Dim-scrim, Particle field, Light beam, Light sweep,
  Film damage. Full-frame, own timeline lane pool, own paint order (`zRank`): scrims under
  the light they pair with, film-damage *above* captions so grain covers everything.
- **Transitions** (`transitions/`) — Crossfade, Glitch, Light-leak, Slide-push,
  Smooth-zoom.
- **Effects** — Ken Burns (`effects/KenBurns.tsx`).
- **Captions** (`captions/CaptionTrack.tsx`) — driven by the Deepgram word timings, offset
  per Act.
- **Fonts** (`fonts.ts`) — `delayRender`/`continueRender` gated so text never renders
  before its face loads.

---

## Rendering architecture

Two paths, selected automatically:

| | Local (default) | AWS Lambda (opt-in) |
|---|---|---|
| Trigger | always available | when all six `REMOTION_*` vars are set (`isLambdaConfigured()`) |
| Bundle | `bundle()` per request — always current code | frozen `REMOTION_SERVE_URL` site bundle, deployed by `npm run deploy:remotion` |
| Media | `cacheRemoteMedia` pulls remote assets to local disk first | `syncPayloadMediaToS3` uploads local + remote assets to S3 and rewrites the payload to presigned URLs (6-hour expiry, skips already-uploaded keys) |
| Parallelism | one Chromium | chunked; `concurrency` capped at 6 by default to stay under a fresh AWS account's Lambda quota — raise `REMOTION_LAMBDA_CONCURRENCY` after a quota increase |
| Progress | render route reports frames | `pollLambdaRenderProgress` maps `getRenderProgress` → `{progress, stage, done, outputUrl, error}` |

**The serve URL is a frozen bundle.** After any change under `src/remotion/**` you must run
`npm run deploy:remotion`, or Lambda renders the previously-deployed code with no error.
`REMOTION_AWS_*` names are used deliberately instead of plain `AWS_*` (which some hosts
auto-populate) so the config never picks up unrelated credentials. The S3 client is given
explicit `REMOTION_AWS_*` credentials rather than the default AWS credential chain for the
same reason.

---

## Data model

Supabase PostgreSQL, RLS on every table, owner policies. No migration runner — every
`db/*.sql` file is pasted into the Supabase SQL editor by hand, in dependency order (see
`db/README.md`). **Filenames are load-bearing** — the app names them in its own error
messages.

Core tables: `users`, `workspaces` (channel + `format_preset_key`, `format_blueprint`,
`format_blueprint_version`, `rotation_cursor`), `video_projects` (`target_duration`,
`act_outlines`, `character_blueprints`, `format_blueprint_snapshot`,
`channel_facts_snapshot`, `narration_url`, `track_states`, status), `scenes`
(`voice_over_beat`, `final_video_prompt`, `scene_type`, `environment`, `lighting`,
`camera_direction`, `media_id`, transition + Ken Burns columns, `act_number`,
`sequence_number`), `act_narrations` (one row per `(project_id, act_number)`: `audio_url`,
`duration_seconds`, `start_seconds`, act-relative `word_timings`), `media`,
`timeline_items`, `overlay_clips`, `channel_facts`, `thumbnails`, Stripe billing columns.

`PROJECT_STATUSES`: `drafting → scripted → narrated → approved` (long-form goes
`scripted → approved`; `narrated` is short/mid-form only).

---

## Repository map

```
src/
  app/
    (dashboard)/        Authenticated UI — workspaces, videos, whiteboard, scene-board,
                        thumbnails, settings
    actions/            "use server" actions — the real backend, one file per domain
                        (whiteboard, video, audio, scene, slicer, format, fact, thumbnail,
                        timeline, overlay-clip, media, workspace, orchestrator)
    api/                Route handlers — streaming, webhooks, uploads, Remotion render
    page.tsx            Marketing landing page (light theme)
  components/ui/        Client components — TimelineEditor, SceneBoard, Whiteboard,
                        ChannelFormatSection, ChannelFactsSection, DeleteProjectButton
  lib/
    ai/
      agents/           casting-director, visual-architect, prompt-assembler,
                        safety-officer, format-analyst, fact-archivist, thumbnail-composer
      providers/        Media backends behind a registry — fal, gemini-image, stock, mock
      openai-provider.ts / openai-tts.ts / elevenlabs.ts / local-tts.ts
      orchestrator.ts   Agents 3-7 sequential chain
      script-writer.ts  Script + arc/hook + act outliner
      generation-rules.ts   Niche matrix + duration/pacing tiers (single source of truth)
      format-profile.ts / format-prompt.ts / format-profile-diff.ts / channel-brief.ts
      channel-facts.ts  Fact ledger types + helpers
      concurrency.ts    Shared rate limiter + bounded map
    render/             lambda-config.ts, lambda-render.ts, s3-sync.ts
    supabase/           client.ts (browser) / server.ts (server components + actions)
  remotion/             The video engine — index.ts is the bundler entry, loaded BY STRING
                        PATH from api/render-remotion; do not rename
  proxy.ts              Next 16 middleware

db/                     Hand-run Supabase SQL, dependency-ordered (db/README.md)
docs/                   Living reference — architecture, schema, channel playbook,
                        fact dossiers, content map
implementation_plans/   Numbered feature specs, referenced by path from source comments —
                        filenames are load-bearing
scripts/                check-format-prompt, preview-beat-sheet, upgrade-channel-format
scripts/smoke/          Provider smoke tests
public/media, public/audio   Runtime-generated, git-ignored (except bundled audio presets)
```

---

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint
npm run build
npm run deploy:remotion   # rebuild the Lambda site bundle after any src/remotion/** change
```

Secrets live in `.env.local` (git-ignored). The app is a single-machine tool — rendering,
narration, and generated media all write to the local filesystem unless AWS Lambda is
configured.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `OPENAI_API_KEY` | all text generation + OpenAI TTS |
| `GEMINI_API_KEY` | image generation |
| `TTS_PROVIDER` | `openai` \| `elevenlabs` \| `local` |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS (if selected) |
| `VOICE_STUDIO_URL` | local Voice Studio HTTP service (default `http://localhost:8880`) — a service you run separately; this repo does not build it |
| `DEEPGRAM_API_KEY` | forced alignment for captions + scene durations |
| `FAL_KEY` | Fal.ai video/B-roll generation |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | stock-footage fallback |
| `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION`, `REMOTION_FUNCTION_NAME`, `REMOTION_SERVE_URL`, `REMOTION_S3_BUCKET_NAME` | AWS Lambda cloud rendering (all six required to enable it) |
| `REMOTION_LAMBDA_CONCURRENCY` | Lambda chunk parallelism (default 6) |
| `AI_MIN_CALL_INTERVAL_MS` | shared LLM rate limiter (default 13000 — free-tier 5 req/min) |
| `AI_SCENE_CONCURRENCY` | per-scene agent concurrency (default 1) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` | billing |

### Database setup

Run the `db/*.sql` files into the Supabase SQL editor in the order documented in
`db/README.md` (base schema → media/timeline → project/scene columns → overlays →
long-form audio → channel blueprint → channel facts). Every script is idempotent.

---

## Scripts and tooling

| Command | Purpose |
|---|---|
| `node scripts/check-format-prompt.mjs` | Proves the migrated presets reproduce the pre-blueprint Script Writer prompt character-for-character. Run after touching any legacy branch in `format-prompt.ts`. |
| `node scripts/preview-beat-sheet.mjs` | Prints the assembled act structure for a tier. |
| `node scripts/upgrade-channel-format.mjs` | Blueprint schema upgrade helper. |
| `scripts/smoke/*.mjs` | Ad-hoc provider smoke tests (Deepgram, Gemini image, slicer, DB) — run from repo root. |

---

## Operating model and current status

- **Single-machine, single-user tool.** No deployment boundary, so no job queue or worker
  process — the pipeline is a synchronous `await` chain and a browser refresh mid-generation
  loses in-flight work.
- **Local rendering is the default.** AWS Lambda cloud rendering is implemented and enabled
  automatically when its six env vars are present.
- **Mock media provider is the default** until video-provider keys are set — the full
  pipeline runs end to end without paid calls, which is how the format, persona, and pacing
  are dialled in.
- **Text + narration run on OpenAI**; image generation runs on Gemini; TTS provider is
  selectable at runtime.
- **`gpt-4o-mini` is the deliberate testing default** for the agent chain and script
  writer while a channel's format is being tuned — raising quality to `gpt-4o` is a
  one-line change in `openai-provider.ts`.
- Server actions and route handlers are cached — after a server-side change, restart
  `npm run dev` before re-testing.
```
