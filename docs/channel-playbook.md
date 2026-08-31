# Channel Format Playbook

**This file is topic-agnostic.** It describes HOW a video is built, not what it is about.
The subject matter lives in `docs/dossiers/` — one dossier per subject area, each holding
verified facts and the traps specific to that subject.

To write a video: read this file **plus** the dossier for the subject.

| Dossier | Covers |
|---|---|
| `dossiers/enoch.md` | 1, 2 and 3 Enoch; Qumran; the canon history |
| `dossiers/mesopotamia.md` | Anunnaki, Sumer, Akkad, Babylon; the creation-as-labour texts |

A chat thread is not a record. These files are. Start here when opening a new session.

Last updated 2026-08-29. Enoch workspace blueprint is at **v12**.

---

## 1. The title formula

Two halves, split by an em-dash:

```
<The Source> [Says|Describes|Reveals] <contradicts something the viewer believes>
  — And <names a concrete thing>
```

**The second half is where titles live or die.** It must name a *thing* the viewer can
picture. Abstractions kill it:

- Dead: "— And Describes What It Actually Is"
- Dead: "— And Reveals The Truth About Heaven"
- Live: "— And Describes Who Is Holding The Record"
- Live: "— And Names Who Is Locked In It"

Rules that hold up:
- Concrete nouns over abstractions. `prison`, `record`, `pen`, `shifts` — not `truth`, `secrets`.
- Do not spend the whole reveal in the title. Keep two or three beats in reserve.
- Mundane words in sacred sentences hook hard: *heaven runs on **shifts***.
- Put the viewer in it where you can: ***Your** Life Is Already Written Down*.
- One giant thumbnail word, drawn from the title: `THE RECORD`, `PRISON`, `NOT JESUS`.

---

## 2. The story structure

Do **not** write beats into the outline. The 17-beat spine lives in
`src/lib/ai/format-profile.ts` (`structure.beatSheet`) and is cut across Acts automatically
by `assignBeatSheet`. Preview it any time:

```
node scripts/preview-beat-sheet.mjs --preset forensic-documentary --acts 7
```

The outline's job is the **argument**, not the shape: what the claim is, what the evidence
is, what escalates, and where it lands.

**Always use Long (15-20m) = 7 Acts.** The reference channel's videos run 18:22-20:27.
20-25m gives the writer 30% more runway than the format is built for, and it fills the extra
by repeating itself.

---

## 3. Form fields

The new-video form takes exactly five things:

| Field | What goes in it |
|---|---|
| Topic | Short noun phrase. `The Archangel Who Holds The Record` |
| Script Hook | One sentence, the strangest true detail |
| Full Story Outline | The argument arc, 4-6 paragraphs. No beats. |
| Visual Aesthetic | Archival documentary photography, desaturated, slow pushes, 5-8s per image |
| Target Duration | Long (15-20m) |

---

## 4. What we do NOT copy from the reference channel

The reference channel (`youtube.com/@EnochUnsealedd`) **fabricates**: one real anchor dressed
in invented corroboration — fake follow-up studies, invented denied FOIA requests,
non-existent private correspondence.

We do not do this. The `sourcingRule` ban stays. Beats that would need invention are fed from
the fact ledger instead. We copy the *structure*, not the fabrication.

---

## 5. Reviewing generated output

The spine replaced a repeating per-Act cycle. Symptoms it was built to kill:

| Check | Expected |
|---|---|
| Acts opening on a manuscript | exactly 1 |
| Acts closing on a literal door | 0 |
| "building inspector" analogy | at most 1 in the whole video |
| Subscribe / promise beat | once, ~90s in, Act 1 |
| An Act that just dwells on one detail | Act 4 |
| "Now, here's where it gets active" | verbatim, Act 6 |
| "Now, let me be clear. I am not saying…" | once, first person, Act 7 |
| Closing sentences starting "still" | Act 7 |

---

## 6. Gotchas

- **The Enoch workspace is on preset `custom`.** Editing the shipped `forensic-documentary`
  preset does **not** reach it. Its own blueprint in `workspaces.format_blueprint` must be
  migrated: `node scripts/upgrade-channel-format.mjs --workspace "Enoch" --apply`
- **Projects freeze `format_blueprint_snapshot`.** An existing project keeps the old format
  forever. After a blueprint change, **start a new project** — do not regenerate into an old one.
- v11 blueprint backup: `db/backup-enoch-blueprint-v11.json`
