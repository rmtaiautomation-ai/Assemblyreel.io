# Channel Blueprint — a data-driven format spec for the generation pipeline

> **Status:** All 7 phases complete.
>
> - **Phase 0.** `db/add-channel-blueprint.sql` written and **applied** — confirmed live
>   against the real Supabase project (`workspaces.format_preset_key` etc. read back
>   successfully for two real workspaces).
> - **Phase 1.** `src/lib/ai/format-profile.ts` — the `FormatProfile` type, five presets
>   (`forensic-documentary` new; `mythic-epic` / `grounded-investigation` /
>   `dark-psychology` / `general` migrated from the old Niche/Tone Matrix, byte-identical
>   behaviour), `resolveFormatProfile`, `mergeFormatProfile`.
> - **Phase 2.** `src/lib/ai/format-prompt.ts` assembles the Script Writer system
>   instruction and Act Outliner structure rules from a profile. Wired into the Script
>   Writer, Act Outliner, Scene Slicer, Casting Director, Visual Architect, Prompt
>   Assembler — all take `formatProfile` as **optional**, falling back to keyword
>   resolution from `nicheTheme`. `node scripts/check-format-prompt.mjs` proves the four
>   migrated presets reproduce the pre-blueprint prompt text character for character
>   (diffed against commit `48a810b`); run it after touching any legacy branch in
>   `format-prompt.ts`.
> - **Phase 3.** ElevenLabs `voice_settings` (stability/similarityBoost/style) and the
>   Scene Slicer's words-per-minute runtime estimate are fully wired — verified with a
>   mocked-`fetch` check on the exact request body. Local TTS `speed` is **deliberately
>   not wired**: Voice Studio has no such setting (confirmed against the user's running
>   instance — this closes the question `implementation_plans/16-long-form-audio-first-pipeline.md`
>   had left open), so `generateLocalSceneSpeech` accepts the parameter for call-site
>   symmetry only and logs a warning rather than silently dropping it. A real fix for
>   local-voice pacing exists — Remotion's `<Audio playbackRate preservePitch>` — but
>   applying it safely requires scaling scene/caption/Act timing together, which is out
>   of scope here; see `VideoComposition.tsx`'s "absolute timeline" comment. The fixed
>   per-tier word-count tables in `generation-rules.ts` also still assume 150 wpm
>   regardless of a profile's actual pace, so `forensic-documentary` (135 wpm) runs
>   somewhat longer than its duration-tier label suggests.
> - **Phase 4.** `src/app/actions/format-actions.ts` — `getWorkspaceFormatProfile` /
>   `saveWorkspaceFormatProfile` (the live, editable blueprint) and
>   `resolveProjectFormatProfile` (the frozen-snapshot resolver every generation call
>   goes through). `createProjectWithActs` resolves the workspace's live profile ONCE at
>   creation and freezes it onto `video_projects.format_blueprint_snapshot`;
>   `generateAct`, `castProjectCharactersOnce`, `approveActVisuals`,
>   `approveAndGenerateVisuals`, `regenerateActVisuals` all read that frozen snapshot
>   rather than the live workspace row — editing the Channel Format tab mid-project
>   cannot change the rules a later Act is written under. Verified with a mocked
>   Supabase client covering all 5 real paths (11 assertions, all passing), including
>   the since-resolved "migration not run" path.
> - **Phase 5.** `src/components/ui/ChannelFormatSection.tsx` — the actual settings tab:
>   preset picker, every `FormatProfile` field grouped as Identity / Delivery / Structure
>   / Content Rules / Visual Grammar, a per-field "modified from preset" badge, and a
>   read-only preview rendering the real assembled Script Writer instruction. Fields
>   intentionally omitted: `pauseBeforeRevelationMs`, `localTts.speed`, `quotationStyle` —
>   none are applied yet (see Phase 3), and an editable control for a setting that does
>   nothing would mislead. `src/lib/ai/format-profile-diff.ts` reduces the form's full
>   profile back to the diff-only shape the workspace stores; round-trip (edit → diff →
>   save → resolve) verified against the compiled module, 12 assertions passing.
>   `settings/page.tsx` became an async Server Component (existing Visual Identity /
>   System Directives / AI Providers sections extracted verbatim into
>   `WorkspaceMockSettingsForm.tsx`, left as mock and explicitly labelled as such per the
>   plan's Phase 5 allowance — Channel Format is the section that's real). Verified
>   against the actual running dev server and two real workspaces from the live Supabase
>   project: both render correctly (HTTP 200, no error boundary), and the save path was
>   exercised against the real `workspaces` row for one of them (write → verify → revert
>   to the exact original row).
> - **Phase 6.** The real per-Act approval gate turned out NOT to be `Whiteboard.tsx`
>   (that page only has a single whole-project "Approve All" button, auto-runs every Act
>   with no per-Act pause) — it's the Act inspector panel in `TimelineEditor.tsx`, added
>   by the "interleaved per-Act audio + visual approval" work
>   (`implementation_plans/17-...md`), where `approveActVisuals` is a genuine per-Act
>   decision. `ActFormatChecklist` renders `structure.actCycle` + `content.requiredBeats`
>   there, right above the "Approve this act's visuals" button. Display-only, as
>   planned — nothing auto-ticks yet. New `getProjectFormatProfile` in
>   `format-actions.ts` is a thin client-callable wrapper around
>   `resolveProjectFormatProfile`, fetched once per project via the same
>   fetch-at-point-of-use pattern `getActNarrations` already uses in that file (avoids
>   threading a prop through the ~8,700-line component). Verified: `tsc`/`npm run build`
>   clean; the real video page for a live project (`.../videos/1650cf88-...`) returns
>   HTTP 200 with no error boundary; the exact query `resolveProjectFormatProfile` issues
>   was run directly against that project's real row and correctly returns
>   `general`'s empty `actCycle`/`requiredBeats` (project predates Phase 4, so it
>   resolves live from its workspace rather than a snapshot) — confirming the checklist
>   correctly renders nothing for a preset that declares no cycle, which is right, not a
>   gap. The populated case (`forensic-documentary`'s 5-beat cycle actually appearing as
>   list items) rests on the same `items.map()` already exercised by `tsc`/build, plus
>   the 11 mocked-client assertions Phase 4 already ran against this exact resolution
>   path.
> - **Phase 7.** Rebuilt from the original sketch, which assumed the Script Writer would
>   report back which framing device it picked — impossible without changing its
>   response contract from a plain `string[]` (schemas.ts) to an object, a real ripple
>   through every caller of `generateScript`. Built as a **deterministic round-robin
>   cursor** instead: `workspaces.rotation_cursor` (new migration,
>   `db/add-rotation-cursor.sql`, NOT the already-applied `add-channel-blueprint.sql`),
>   `selectRotatingDevice(profile, cursor)` in `format-profile.ts` (pure, wraps rather
>   than throws), `consumeRotationCursor(projectId)` in `format-actions.ts` (resolves
>   workspace from project, reads, writes back, returns `null` — never throws — on any
>   failure). `generateAct` consumes a cursor only when the profile's device pool is
>   non-empty and passes the pick to `generateScript` as `selectedFramingDevice`;
>   `buildScriptWriterSystemInstruction`'s FRAMING DEVICE block emits a mandatory
>   "build around this device" instruction when one was pre-selected, falling back to
>   the original free-choice instruction otherwise — so a project on a database that
>   hasn't run the new migration behaves exactly as it did before this phase.
>   Verified: `tsc`/`npm run build` clean; `check-format-prompt.mjs` still passes; 13
>   assertions on `selectRotatingDevice` (full-cycle coverage, forward/backward
>   wrap-around, empty pool) and the prompt's two branches; 6 mocked-client assertions
>   on `consumeRotationCursor` (happy path, cursor=0 treated as valid not missing,
>   migration-not-run, project-not-found, write-failure); the "migration not run"
>   degrade path was then confirmed directly against the real database — `rotation_cursor`
>   genuinely does not exist there yet, exactly the case Phase 7 is built to survive.
> - Still deferred: the pause/quote markers and the alignment split they need (Phase 3's
>   original scope; unchanged).

## Context

The user is preparing to launch a faceless long-form YouTube channel (Book of Enoch / apocryphal
documentary niche) on this pipeline, and intends to run **multiple channels in different niches**
from the same app. Research on two established channels in the target niche established what the
format actually requires: a fixed narrative machine repeated video after video, a specific vocal
register, a rotating (never repeated) "suppression" device, verbatim primary-source quotation, and
a personal-stake beat early in every episode.

The pipeline cannot currently express any of that, and in two places it actively fights it:

| Problem | Where |
|---|---|
| Niche is guessed from a substring of free text. `"bible"` → **mythology** → *"Epic, NLT Bible style, grandiose, and poetic scale"* — the opposite of the flat, forensic register the format needs. | [generation-rules.ts:107-122](src/lib/ai/generation-rules.ts#L107-L122) |
| The **Camera-Ready Rule** forces *every* line to name a visible subject, action and location, with no abstract concepts. Documentary lines ("fragment 4Q206 preserves the passage") are disallowed by rule. | [script-writer.ts:56](src/lib/ai/script-writer.ts#L56) |
| No delivery/mood concept exists at all. `scriptTone` steers word choice only; `pacingRule` is *visual* pacing for the Slicer. | [generation-rules.ts:52-62](src/lib/ai/generation-rules.ts#L52-L62) |
| TTS voice settings are hardcoded constants — `stability: 0.5, similarity_boost: 0.5` — identical for every video in every workspace. | [elevenlabs.ts:29-32](src/lib/ai/elevenlabs.ts#L29-L32) |
| The line cleaner strips **all quotes**, asterisks and underscores, so verbatim-quotation signalling cannot survive to synthesis. | [script-writer.ts:102-110](src/lib/ai/script-writer.ts#L102-L110) |
| Act structure is a hardcoded prompt paragraph, not data. | [script-writer.ts:179-183](src/lib/ai/script-writer.ts#L179-L183) |
| The workspace Settings page is entirely mock state — `// TODO: Wire up to Supabase update`. Nothing on it persists. | [settings/page.tsx:19](src/app/(dashboard)/workspaces/[slug]/settings/page.tsx#L19) |

**Intended outcome:** one editable, versioned **Channel Blueprint** per workspace that is the single
source of truth for register, delivery, structure and content rules — so video 1 and video 100 come
out of the same machine, and a second channel in a different niche is a data change, not a code fork.

---

## Design

### Three-layer resolution

```
per-video override  →  workspace blueprint  →  built-in preset  →  hardcoded default
```

- **Built-in presets** live in code so a new workspace never starts blank.
- **Workspace blueprint** is a `jsonb` column — the user's edits, deep-merged over the preset.
- **Per-video override** is the escape hatch for one-off experiments.

### Structured fields, not a prose blob

The blueprint is a **typed object that compiles into prompt fragments**, not one freeform
"instructions" textarea. Rationale: a prose blob is weighted unpredictably by the model, cannot be
A/B tested, and drifts without anyone noticing. One optional `additionalDirection` string is kept as
an escape hatch, appended last.

### Snapshot, don't just version

Every project stores a **full copy** of the blueprint that produced it, plus its version number.
Storing the snapshot rather than a foreign key means a video is always reproducible after the
channel format changes, with no join. This is what makes retention data actionable: when video 43
outperforms, the exact format that produced it is on the row.

---

## The blueprint type

New file: `src/lib/ai/format-profile.ts`. Absorbs and replaces `NicheProfile`
([generation-rules.ts:45-97](src/lib/ai/generation-rules.ts#L45-L97)); `DurationProfile` stays where
it is and remains orthogonal (runtime tiers are not a channel-format concern).

```ts
export interface FormatProfile {
  key: string;                 // preset id, e.g. "forensic-documentary"
  label: string;
  version: number;             // bumped on every workspace save

  identity: {
    narratorPersona: string;   // "an investigator reading from a case file"
    register: string;          // "clinical, flat, matter-of-fact"
    forbiddenRegisters: string[]; // ["preachy", "hype", "sermon"]
  };

  delivery: {                  // NEW — nothing equivalent exists today
    wordsPerMinute: number;             // overrides NARRATION_WORDS_PER_MINUTE
    elevenlabs: { stability: number; similarityBoost: number; style?: number };
    localTts:   { speed?: number };
    pauseBeforeRevelationMs: number;    // Phase 3
    quotationStyle: "spoken-marker" | "none";
  };

  structure: {
    actCycle: string[];        // the beats every Act must contain, in order
    coldOpen: { maxSeconds: number; payoffDeadlineSeconds: number; bannedOpenings: string[] };
    terminalRevelation: boolean;
    reHookIntervalSeconds: number;
    closer: "open-door" | "summary" | "cta";
  };

  content: {
    lineComposition: "camera-ready" | "documentary";  // relaxes script-writer.ts:56
    readingLevel: string;
    requiredBeats: string[];        // e.g. ["personal-stake by Act 2", "verbatim citation"]
    sourcingRule: string;
    rotatingDevices: string[];      // pool the writer must vary across videos
    rotationWindow: number;         // no reuse within N videos
  };

  visual: {
    visualBias: string;             // → Slicer (was NicheProfile.visualBias)
    promptStyleTag: string;         // → Prompt Assembler (was NicheProfile.promptStyleTag)
    preferredSceneTypes: SceneType[];
    stillTreatment: string;
    evidenceCardFormat: string;
  };

  additionalDirection?: string;     // freeform escape hatch, appended last
}
```

### Presets to ship

1. **`forensic-documentary`** — the new one. Flat register, `lineComposition: "documentary"`,
   high ElevenLabs `stability` (~0.85), ~135 wpm, required verbatim citation + personal-stake beat,
   rotating device pool so no two videos open the same way.
2. **`mythic-epic`** — the existing `mythology` profile lifted into the new shape (no behaviour change).
3. **`grounded-investigation`** — the existing `true-crime` profile, likewise.

`dark-psychology` and `general` migrate as-is. Every current `NicheProfile` field has a home above,
so migration is mechanical.

---

## Work phases

### Phase 0 — Migration

New `db/add-channel-blueprint.sql`, following the header-comment + RLS conventions of
[db/add-act-narration.sql](db/add-act-narration.sql) (manual paste into the Supabase SQL editor).

```sql
alter table public.workspaces
  add column if not exists format_preset_key text default 'mythic-epic',
  add column if not exists format_blueprint jsonb,        -- user overrides only
  add column if not exists format_blueprint_version integer not null default 1;

alter table public.video_projects
  add column if not exists format_blueprint_snapshot jsonb,
  add column if not exists format_blueprint_version integer;
```

`format_blueprint` holds **only the diff** from the preset; `format_blueprint_snapshot` holds the
**fully resolved** object. No new tables, no new RLS policies — both tables already have owner
policies that cover the added columns.

### Phase 1 — Type, presets, resolution (pure, no behaviour change)

- Create `format-profile.ts` with the type, the presets, and:
  ```ts
  resolveFormatProfile({ presetKey, blueprintOverride, nicheTheme }): FormatProfile
  ```
  Preference order: explicit `presetKey` → keyword match on `nicheTheme` (existing
  `NICHE_KEYWORDS` logic, kept only as a fallback for legacy rows) → `general`.
- Deep-merge `blueprintOverride` over the preset (per-field, so a partial override is safe).
- Keep `resolveNicheProfile` as a thin deprecated shim returning the `visual` + `identity` subset,
  so [slicer-actions.ts:78](src/app/actions/slicer-actions.ts#L78) keeps compiling until Phase 2.

**Checkpoint:** existing generations produce byte-identical output.

### Phase 2 — Inject into the text agents

- **Script Writer** ([script-writer.ts:49-58](src/lib/ai/script-writer.ts#L49-L58)) — assemble
  `systemInstruction` from the blueprint instead of the four hardcoded rules. Rule 3 becomes
  conditional on `content.lineComposition`; the `documentary` variant permits named entities, dates
  and citations without a visible on-screen subject. Add `requiredBeats` and `sourcingRule`.
- **Act Outliner** ([script-writer.ts:170-189](src/lib/ai/script-writer.ts#L170-L189)) — replace the
  hardcoded Act 1/2/N paragraph with `structure.actCycle`, applied per Act. This is what turns the
  format's single arc into one full cycle per Act — the main retention change.
- **Scene Slicer** ([slicer-actions.ts:91-99](src/app/actions/slicer-actions.ts#L91-L99)) — read
  `visual.*` from the blueprint; drop the shim.
- **Visual Architect / Prompt Assembler / Casting Director** — thread `FormatProfile` through
  `OrchestrationParams` ([orchestrator.ts:36-54](src/lib/ai/orchestrator.ts#L36-L54)) alongside the
  existing `nicheTheme`, and use `visual.promptStyleTag` / `stillTreatment`.

Callers to update: [video-actions.ts:119](src/app/actions/video-actions.ts#L119),
[whiteboard-actions.ts:215](src/app/actions/whiteboard-actions.ts#L215).

### Phase 3 — Delivery spec into TTS

- Add an optional `delivery: DeliverySpec` parameter to `generateSceneSpeech`
  ([elevenlabs.ts:6](src/lib/ai/elevenlabs.ts#L6)) and `generateLocalSceneSpeech`
  ([local-tts.ts:40](src/lib/ai/local-tts.ts#L40)); fall back to today's constants when absent.
- Thread it through `generateSceneAudio` / `synthesizeAndAlign` in
  [audio-actions.ts](src/app/actions/audio-actions.ts) beside the existing `voiceId`.
- Use `delivery.wordsPerMinute` in place of the module constant
  [`NARRATION_WORDS_PER_MINUTE`](src/lib/ai/generation-rules.ts#L13) wherever runtime is estimated.

**Deferred within this phase — inline pause/quote markers.** The obvious next step is emitting
`[[pause:900]]` and quote markers in the script and narrowing the cleaner regex at
[script-writer.ts:102-110](src/lib/ai/script-writer.ts#L102-L110). It is deliberately *not* done
here, because `synthesizeAndAlign` matches Deepgram's returned words against the scene text with a
±5-word window; any token present in the TTS input but absent from the transcript will desync
alignment and silently shift every later scene. Doing it safely requires splitting scene text into
`spokenText` (markers, → TTS) and `alignmentText` (markers stripped, → word matching), which is a
change to the alignment contract and belongs in its own pass. Register and TTS parameters deliver
most of the audible benefit without touching it.

### Phase 4 — Persist and snapshot

- `getWorkspaceBlueprint(workspaceId)` / `saveWorkspaceBlueprint(...)` server actions; save bumps
  `format_blueprint_version`.
- At project creation ([video-actions.ts](src/app/actions/video-actions.ts),
  [whiteboard-actions.ts](src/app/actions/whiteboard-actions.ts)), resolve once and write
  `format_blueprint_snapshot` + `format_blueprint_version` onto the project row.
- **Every downstream agent reads the snapshot, never the live workspace row.** Editing the blueprint
  mid-generation must not change Act 7's rules after Act 1 was approved under different ones.

### Phase 5 — Settings UI

Extend [settings/page.tsx](src/app/(dashboard)/workspaces/[slug]/settings/page.tsx) with a
**Channel Format** section. Note this page is currently 100% mock state and saves nothing — Phase 5
includes wiring the existing Visual Identity / Providers sections to real persistence, or explicitly
leaving them marked as mock so the new section's behaviour is not ambiguous.

Fields grouped as the type is: Identity, Delivery, Structure, Content Rules, Visual Grammar. Plus:

- a **preset picker** that resets the section to a shipped preset;
- a **"modified from preset"** badge per field, since only the diff is stored;
- a **read-only preview** of the assembled system instruction, so the user can see exactly what the
  LLM will receive.

### Phase 6 — Act approval checklist

Render `structure.actCycle` + `content.requiredBeats` as a visible checklist on the existing per-Act
approval gate in [Whiteboard.tsx](src/components/ui/Whiteboard.tsx). Display-only first; an optional
cheap LLM self-check pass can pre-tick it later. Same data, second use — this is what enforces
consistency at the moment of human review.

### Phase 7 — Rotation ledger (optional, do last)

To stop every video opening with the same device: on project completion, record which
`rotatingDevices` entries were used (a `jsonb` array on `video_projects`). The Script Writer prompt
then receives *"do not use: X, Y, Z"* drawn from the last `rotationWindow` projects in the workspace.
Small, and it is the mechanism that prevents 27 videos from sounding like one.

---

## Files touched

**New:** `src/lib/ai/format-profile.ts`, `db/add-channel-blueprint.sql`,
`implementation_plans/18-channel-blueprint.md` (this document, per repo convention).

**Modified:** [generation-rules.ts](src/lib/ai/generation-rules.ts) (niche matrix moves out,
duration tiers stay), [script-writer.ts](src/lib/ai/script-writer.ts),
[slicer-actions.ts](src/app/actions/slicer-actions.ts), [orchestrator.ts](src/lib/ai/orchestrator.ts)
and the three `agents/*` it calls, [elevenlabs.ts](src/lib/ai/elevenlabs.ts),
[local-tts.ts](src/lib/ai/local-tts.ts), [audio-actions.ts](src/app/actions/audio-actions.ts),
[video-actions.ts](src/app/actions/video-actions.ts),
[whiteboard-actions.ts](src/app/actions/whiteboard-actions.ts),
[settings/page.tsx](src/app/(dashboard)/workspaces/[slug]/settings/page.tsx),
[Whiteboard.tsx](src/components/ui/Whiteboard.tsx).

---

## Verification

**Phase 1 regression gate.** Generate a script with a workspace that has no blueprint, before and
after. Output must be identical — resolution alone changes nothing.

**Phase 2 format check.** On a workspace set to `forensic-documentary`, generate a long-form script
and confirm: lines carry named entities/dates/citations (previously blocked by the Camera-Ready
Rule); the register is flat rather than "Epic, NLT Bible style"; each Act contains a full cycle
rather than the video containing one.

**Phase 3 audio check.** Generate the same Act under `forensic-documentary` and `mythic-epic` and
confirm the two audio files differ audibly, and that the request body carries the profile's
stability/similarity values. Then confirm `act_narrations.word_timings` still align — scene
boundaries must land on the same words as before, since Phase 3 changes voice parameters but not
the text sent for alignment.

**Phase 4 isolation check.** Start a long-form generation, approve Act 1, edit the workspace
blueprint, then generate Act 2. Act 2 must follow the *snapshot*, not the edit. Confirm
`format_blueprint_version` on the project row still reads the pre-edit version.

**Phase 5 round-trip.** Edit a field, save, reload, confirm persistence; confirm only the diff is in
`workspaces.format_blueprint` and the preset supplies the rest; confirm the assembled-instruction
preview matches what the Script Writer actually sends.

**End to end.** One full long-form video under `forensic-documentary` with per-Act approval, through
to render — the real test being whether Act 5 sounds like it came from the same channel as Act 1.

---

## Out of scope

Thumbnail generation (still manual, and the highest-leverage manual step); YouTube analytics
ingestion for closing the retention→format loop; inline pause/quote markers and the alignment split
they require (see Phase 3); any change to the duration/pacing tiers, which stay orthogonal.
