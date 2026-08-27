# Channel Fact Ledger — a closed vocabulary of sources a script may name

> **Status:** Built. `db/add-channel-facts.sql` **not yet applied** — every path degrades
> to pre-ledger behaviour until it is run in the Supabase SQL editor.
>
> - `src/lib/ai/channel-facts.ts` — pure types and helpers (`ChannelFact`, `FACT_KINDS`,
>   `partitionFacts`, `groupFactsByKind`), importable from both a client component and an
>   agent, the same role `channel-brief.ts` plays for the blueprint.
> - `src/lib/ai/agents/fact-archivist.ts` — setup-time extraction agent.
> - `src/app/actions/fact-actions.ts` — ledger CRUD plus `resolveProjectFactLedger`, the
>   frozen-snapshot resolver every generation call goes through.
> - `src/lib/ai/format-prompt.ts` — the `NAMED SOURCES` block. Emits nothing for an empty
>   ledger; `node scripts/check-format-prompt.mjs` still passes.
> - `src/components/ui/ChannelFactsSection.tsx` + a third Settings tab.

## The problem

This channel format names a real scholar, council, manuscript or date every fifteen to
twenty seconds. That cadence is not decoration — it is the entire credibility mechanism,
and research across three episodes of the reference channel found roughly ten named items
per twenty-minute video.

The Script Writer is handed a topic, an outline and a persona, and nothing else
([script-writer.ts](../src/lib/ai/script-writer.ts)). So when it reaches a beat that
demands a named authority it has none to reach for, and produces one: a real scholar
attached to a paper they never wrote, a fragment number belonging to nothing. Fluent,
correctly formatted, invented.

This is structural. The format opens a slot every few sentences and a language model fills
every slot it is given. No amount of firmness in `content.sourcingRule` changes that,
because a prohibition with no permitted alternative still leaves the beat to be written.

## The observation that makes it cheap

Across those three episodes the **story** changed completely — a four-chamber afterlife, a
sealed Antarctic structure, seven layers of heaven — while the **named sources** barely
moved. Axum, Laodicea 364 CE, Qumran 1947, Nickelsburg 2001, Ephraim Isaac 1983, R.H.
Charles 1906 recurred nearly verbatim, in the same order, doing the same jobs.

The citation frame is fixed channel-level data. Only the payload is per-episode.

So a channel needs one list of a few dozen real items, written once, drawn from forever —
not a per-video research pipeline. Video #40 is as well-sourced as video #1 at no extra
cost.

## The design

### The list is mined, not authored

Nobody types forty verified citations, and asking them to would make this research work
rather than settings work — the same mistake the twenty-five-field blueprint form made
before `ChannelBriefBuilder` was put in front of it.

The user already pastes research into the Format tab, and `analyzeChannelBrief` already
stores it as `sourceBrief` — which `format-profile.ts` marks *"PROVENANCE ONLY — never
compiled into a prompt"*, correctly, since replaying prose to the Script Writer
reintroduces exactly the unweightable freeform blob the blueprint exists to replace. But
that text is dense with the one thing the writer cannot safely invent.

So `generateFormatFromBrief` now runs both agents concurrently on the same paste. One
paste, two extractions, no extra work asked of the user.

### `verified` is the whole feature

Every extracted row lands `verified: false`, and the compiled prompt reads only verified
rows.

This is not caution for its own sake. Source material in this genre characteristically
mixes independently checkable anchors (a church council, a published commentary) with
items unfalsifiable by construction — a tablet that "disappeared from every institutional
collection without an accession number", a monograph "circulated to eleven colleagues and
never published". Both appear in the brief; both get extracted, because an agent cannot
reliably separate them and a silent guess is worse than no guess. The archivist's
`checkable` judgement is surfaced as a warning on the row, and the human tick is what
promotes a fact into the prompt.

`addExtractedFacts` writes `verified: false` itself rather than trusting its caller — a
path that could set it otherwise would erode the gate quietly.

### Rows are typed because the beats are typed

The writer is not choosing freely. An act-cycle beat like *"name who removed or restricted
it, and when"* needs a council and a year; *"the standard scholarly reference is"* needs a
person and a publication. `kind` lets the compiled block group the pool so the model
reaches into the right group instead of scanning forty flat entries.

`always_use` splits the fixed opening frame (cited every episode, same wording) from the
draw-on-demand pool. Without it the writer treats the ledger as a menu and the channel's
signature opening stops being fixed — the most recognisable thing about a format like this.

### The escape hatch is the mechanism

The `NAMED SOURCES` block ends with an absolute rule that also says what to do instead:
write the claim unattributed — *"scholars working on these texts"*, *"a fourth-century
council"* — and move on. A prohibition alone gets satisfied by invention, because the beat
still has to be written. Naming the alternative is what makes the rule followable.

### Freezing, for the same reason the blueprint freezes

`video_projects.channel_facts_snapshot` mirrors `format_blueprint_snapshot`. Long-form
generates Act by Act behind a human approval gate, so a ledger read live would let a fact
ticked — or unticked — after Act 3 was approved silently change what Act 7 may say.

`resolveProjectFactLedger` writes the snapshot on first use rather than at project
creation, the self-healing shape `castProjectCharactersOnce` uses: the column *is* the
flag, so a project predating this feature picks up a ledger on its next Act instead of
being permanently excluded. It freezes `[]` as well as a populated list — `null` means
"never resolved" and would send later Acts back to the live table.

## Degrade paths

Every one of them lands on pre-ledger behaviour, and all are exercised by a database that
has not run the migration:

| Failure | Result |
|---|---|
| `db/add-channel-facts.sql` not run | `getChannelFacts` returns `migrationPending`; the Facts tab explains rather than errors |
| Ledger empty or unresolvable | `resolveProjectFactLedger` returns `[]` |
| Empty ledger reaches the compiler | No `NAMED SOURCES` block at all — output byte-identical to before |
| Archivist fails but analyst succeeds | Format is returned with `factsError`; the format work is not thrown away |

`buildScriptWriterSystemInstruction` with `facts: []` and with `facts` omitted were
verified to produce identical strings, and `scripts/check-format-prompt.mjs` still passes
on all five presets.

## Not addressed here

- **Act-to-act drift.** `generateScript` receives only topic, arc, hook and a one-sentence
  act goal ([whiteboard-actions.ts:277](../src/app/actions/whiteboard-actions.ts)), so Act
  9 never sees a word Act 1 wrote — which breaks the callbacks this format runs on. The
  text already accumulates in `combinedScript`
  ([video-actions.ts:64](../src/app/actions/video-actions.ts)); it is simply never passed
  back in.
- **Uniform line rhythm.** `WORDS_PER_NARRATION_LINE = 15` compiles into both line rules,
  flattening the long-sentence/four-word-fragment alternation the reference format depends
  on. Not a one-line change: the same constant divides into `targetLineCount` in
  `generation-rules.ts`, so altering it shifts every duration tier.
- **Citation density as a dial.** Every format currently gets the same treatment. A
  `citationDensity: heavy | light | none` on `FormatContent` would stop non-documentary
  niches inheriting a style built for this one.

An earlier session recorded the rotation cursor advancing per Act rather than per video as
a bug. It is not — `db/add-rotation-cursor.sql` documents per-Act rotation as the intent.

## Verification

1. Load Settings → Facts **before** running the migration. The tab must render with the
   amber banner, and generation must still work.
2. Run `db/add-channel-facts.sql` in the Supabase SQL editor, reload.
3. Paste channel research into Settings → Format. The format builds as before, and a line
   appears reporting how many named sources were found.
4. Open Facts. Rows are present, all unticked, doubtful ones first with a warning.
5. Tick roughly ten, mark the opening-frame items *Every ep.*, and generate a long-form
   project.
6. Read the script: every named person, council, year and manuscript must appear on the
   ticked list, and beats needing an unlisted source must say "scholars" rather than name
   anyone.
7. Confirm `video_projects.channel_facts_snapshot` is populated, then edit the ledger and
   generate a later Act — it must follow the snapshot, not the edit.
8. Regression: generate in a workspace with an empty ledger; the prompt must be unchanged.
