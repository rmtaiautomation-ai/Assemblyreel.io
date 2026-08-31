/**
 * Compiles a FormatProfile into the prompt fragments the text agents send.
 * (implementation_plans/18-channel-blueprint.md, Phase 2)
 *
 * Deliberately a separate module from both `format-profile.ts` (which is pure data) and
 * `script-writer.ts` (which is `"use server"`): the Phase 5 settings screen has to render a
 * read-only preview of exactly what the LLM will receive, and a client component cannot
 * import a server module to do it. Everything here is pure — no providers, no I/O.
 *
 * ## The byte-identity contract
 *
 * Every migrated preset leaves its new fields empty (`actCycle: []`, `sourcingRule: ""`,
 * `narratorPersona: ""`, and so on), and every optional block below is emitted ONLY when
 * its field is non-empty. So for the four migrated presets these builders reproduce the
 * pre-blueprint prompt text character for character, and Phase 2 is a refactor rather than
 * a behaviour change. `scripts/check-format-prompt.mjs` asserts that against a frozen copy
 * of the original strings — if you edit a legacy branch here, that check fails.
 */

import { WORDS_PER_NARRATION_LINE } from "./generation-rules";
import {
  assignArcBeats,
  assignBeatSheet,
  type Beat,
  type FormatProfile,
} from "./format-profile";
import {
  formatFactForPrompt,
  groupFactsByKind,
  partitionFacts,
  type ActContinuityEntry,
  type ChannelFact,
} from "./channel-facts";

/* -------------------------------------------------------------------------- */
/*                              Script Writer                                 */
/* -------------------------------------------------------------------------- */

/**
 * CRITICAL RULE 3 — what a single narration line is allowed to be.
 *
 * `camera-ready` is the original rule, and it exists because every line becomes an image
 * prompt. `documentary` is the reason this whole module exists: under the camera-ready
 * rule a line like "the council removed it in 364" is forbidden, since it has no visible
 * subject, action or location — which makes an evidence-led format impossible to write.
 */
function lineCompositionRule(profile: FormatProfile): string {
  if (profile.content.lineComposition === "documentary") {
    // The length half of this rule used to read "aim for roughly N words per line — long
    // enough to carry a real claim, not a clipped fragment", which flatly contradicted the
    // rhythm instruction a documentary channel puts in `register` ("a long sentence, then a
    // fragment of three or four words landing alone"). A concrete number beats an abstract
    // stylistic note every time, so the model obeyed this line and produced 132 consecutive
    // scenes between 14 and 25 words — the one texture the format cannot do without. N is
    // now stated as the AVERAGE it always actually was, and the fragment is explicitly
    // permitted rather than explicitly banned.
    return `3. Documentary Line Rule: Lines may name people, institutions, places, dates, documents and sources that are NOT visible on screen. Do not force a physical subject into every line. Prefer the specific noun, the exact date and the named source over general description. Vary line length deliberately: most lines carry a full claim, but land a short fragment of three to six words at each turn in the argument. Average roughly ${WORDS_PER_NARRATION_LINE} words per line ACROSS the Act — never write every line at the same length.`;
  }

  return `3. Camera-Ready Rule: EVERY SINGLE LINE MUST state WHO (physical subject), WHAT (physical action), and WHERE (visible location). Do not use abstract concepts or metaphors. Describe what is visibly happening on screen. Aim for roughly ${WORDS_PER_NARRATION_LINE} words per line — long enough to carry real visual detail, not a clipped fragment.`;
}

/** CRITICAL RULE 4 — how the script ends. */
function closerRule(profile: FormatProfile): string {
  switch (profile.structure.closer) {
    case "open-door":
      return `4. Open Door Rule: Do NOT summarise and do NOT conclude. The final line must restate the largest question this script left unanswered, and point at what comes next.`;
    case "summary":
      return `4. Summary Rule: The final line must restate the single most important thing established, in one sentence, with no call to action.`;
    case "cta":
    default:
      return `4. Money Shot Rule: The final line must combine a visual summary and an explicit Call To Action (CTA).`;
  }
}

/** Renders a titled block, or nothing at all when there is nothing to say. */
function block(title: string, body: string): string {
  return body.trim() ? `\n### ${title}:\n${body.trim()}\n` : "";
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * The NAMED SOURCES block — a closed vocabulary of things the writer may name.
 *
 * This is the half of sourcing that an instruction alone cannot do. `content.sourcingRule`
 * says how sources should be handled; it cannot say WHICH, and a format that demands a
 * named authority every fifteen seconds will fill each of those slots whether or not it has
 * anything real to fill them with. Naming the permitted set — and, just as importantly,
 * giving the writer somewhere to go when nothing fits — is what converts "please don't
 * fabricate" into a constraint that holds.
 *
 * Split into the fixed frame and the draw-on-demand pool because those are used
 * differently: the frame is the channel's recognisable opening, repeated verbatim every
 * episode, while the pool is drawn from only when a beat calls for that kind of item.
 * Grouping the pool by kind matters for the same reason the rows are typed at all — the act
 * cycle asks for "who removed it, and when", and the model should be reaching into councils
 * for that, not scanning one flat list of forty entries.
 *
 * Emits nothing at all for an empty ledger, so a channel that has not built one — or a
 * database that has not run `db/add-channel-facts.sql` — produces exactly the prompt it
 * produced before this existed.
 */
function namedSourcesBlock(facts: readonly ChannelFact[]): string {
  if (!facts.length) return "";

  const { frame, pool } = partitionFacts(facts);
  const sections: string[] = [];

  if (frame.length) {
    // "They appear in every episode — use them" is what this said, meaning once per VIDEO.
    // Every Act receives this block, so each one read it as "use them here", and a positive
    // instruction to cite beats the arcBeats block's negative instruction not to. That is
    // the larger half of why the Council of Laodicea appeared in Act 7 AND Act 8 of two
    // separate 9-Act videos. The frame is still fixed and still verbatim — it is the scope
    // of "every episode" that had to be said out loud.
    sections.push(
      `These are this channel's fixed reference points, and the wording to use for them. They belong to the episode as a whole — each is spent ONCE, in whichever Act's beat calls for it, not in every Act. Do not reach for one just because it is listed here:\n${bullets(
        frame.map(formatFactForPrompt)
      )}`
    );
  }

  if (pool.length) {
    const grouped = groupFactsByKind(pool)
      .map((group) => `${group.label}:\n${bullets(group.facts.map(formatFactForPrompt))}`)
      .join("\n\n");

    sections.push(
      `Draw on the following only where a beat actually calls for that kind of source. Do not list them all, and do not force one in where the writing does not need it:\n\n${grouped}`
    );
  }

  // The escape hatch is not politeness — it is the whole mechanism. A prohibition with no
  // permitted alternative gets satisfied by invention, because the beat still has to be
  // written. Naming what to do instead is what makes the rule followable.
  sections.push(
    `ABSOLUTE RULE — this overrides every other instruction about specificity:
Never name a person, institution, council, manuscript, publication, artifact or dated event that does not appear above. Not one. This applies even when a beat plainly calls for a citation and nothing listed fits, and even when you are confident a real source exists.
When that happens, write the claim WITHOUT a name — "scholars working on these texts", "a fourth-century council", "the standard English translation" — and move on. An unattributed claim is correct here. An invented citation is the single worst thing this script can contain, and a plausible one is worse than an obviously wrong one.
Do not invent catalogue numbers, fragment identifiers, accession numbers, publication years, journal names or institutional affiliations. If a listed source above carries no year, cite it without a year.`
  );

  return block("NAMED SOURCES", sections.join("\n\n"));
}

/**
 * What earlier Acts have already covered, so this one does not do it again.
 *
 * The counterpart to the arcBeats reserve list, and the half it was missing. That list is a
 * rule about the FUTURE ("the suppression beat belongs to Act 8"), which an Act can satisfy
 * while still repeating something Act 3 already said. This is a record of the PAST, and a
 * concrete named fact is far harder to talk past than an abstract beat assignment.
 *
 * Emits nothing for Act 1, or for a project whose database has no `act_continuity` column —
 * in both cases there is genuinely nothing to report, and an empty "previously" heading
 * would only invite the model to invent something to fill it.
 */
function continuityBlock(entries: readonly ActContinuityEntry[]): string {
  const prior = entries
    .filter((entry) => entry.namedFacts.length || entry.title.trim())
    .sort((a, b) => a.actNumber - b.actNumber);

  if (!prior.length) return "";

  const lines = prior.map((entry) => {
    const named = entry.namedFacts.length
      ? `named ${entry.namedFacts.join(", ")}`
      : "named no sources from the ledger";
    return `- Act ${entry.actNumber} (${entry.title}) — ${named}`;
  });

  const alreadyNamed = [...new Set(prior.flatMap((entry) => entry.namedFacts))];

  return block(
    "ALREADY COVERED IN THIS VIDEO",
    `${lines.join("\n")}

${
  alreadyNamed.length
    ? `The viewer has ALREADY been told about: ${alreadyNamed.join(", ")}. Do not introduce, explain or re-establish any of them again — this Act may refer back to one in passing if the argument genuinely needs it, but must not spend lines re-stating what it is or when it happened.`
    : "Nothing from the source ledger has been spent yet."
}`
  );
}

/**
 * A beat's first sentence, for the "already spent" and "still to come" lists.
 *
 * Those lists exist to stop an Act writing another Act's material, which only needs enough
 * text to recognise the beat by. Sending all seventeen instructions in full to all
 * seventeen Acts would trade the repetition problem for a prompt in which the Act's OWN
 * beats are a twentieth of what it is reading. Ids are deliberately not used — they are
 * internal identifiers, and a model shown "live-suppression" will write the words back.
 */
function beatGist(beat: Beat): string {
  const trimmed = beat.instruction.trim();
  const stop = trimmed.indexOf(". ");
  const first = stop === -1 ? trimmed : trimmed.slice(0, stop + 1);
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}...` : first;
}

/**
 * THIS ACT'S BEATS — the block that replaces ACT CYCLE and THIS ACT'S PLACE IN THE VIDEO.
 *
 * The three blocks are mutually exclusive by construction: this one returns "" for an empty
 * `beatSheet`, and the caller suppresses the other two whenever this one produces anything.
 * Handing a model both a cycle to repeat and a spine to advance is worse than either alone
 * — it satisfies the cycle, which is concrete and per-Act, and treats the spine as flavour.
 *
 * Each beat carries its own apparatus verdict rather than relying on the global
 * `apparatusRule` alone, for the same reason `WORDS_PER_NARRATION_LINE` is a number: a
 * channel-wide budget ("under a fifth of the lines") is invisible from inside a single Act,
 * which is how a 9-Act script ran ~42% apparatus in every Act while each Act individually
 * believed it was being restrained.
 */
function beatSheetBlock(
  profile: FormatProfile,
  options: { actNumber?: number; actCount?: number }
): string {
  const { actNumber, actCount } = options;
  const sheet = profile.structure.beatSheet;
  if (!actNumber || !actCount || !sheet.length) return "";

  const assignments = assignBeatSheet(profile, actCount);
  const mine = assignments.get(actNumber) ?? [];
  if (!mine.length) return "";

  const indexOf = new Map(sheet.map((beat, index) => [beat.id, index + 1]));
  const numbers = mine.map((beat) => indexOf.get(beat.id) ?? 0);
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);

  const body = mine.map((beat) => {
    const lines = [`BEAT ${indexOf.get(beat.id)} of ${sheet.length}`];

    if (beat.signpost) {
      // Verbatim, not paraphrased. These recur near word-for-word across every episode of
      // the reference format and are most of what makes narration sound spoken rather than
      // written; a model asked to "use a phrase like this" will smooth it into prose.
      lines.push(
        `Open this beat with exactly this line, word for word: "${beat.signpost}"`
      );
    }

    lines.push(beat.instruction);
    lines.push(
      beat.apparatus
        ? "Apparatus is permitted in this beat — manuscripts, editions, fragment numbers and translators belong here."
        : "NO apparatus in this beat. Do not describe a manuscript, a parchment, a folio, a catalogue or a fragment number. Write what the text says, not what it is written on."
    );

    return lines.join("\n");
  });

  const spent = sheet
    .slice(0, first - 1)
    .map((beat, index) => `- Beat ${index + 1}: ${beatGist(beat)}`);
  const upcoming = sheet
    .slice(last)
    .map((beat, index) => `- Beat ${last + index + 1}: ${beatGist(beat)}`);

  const sections = [
    `This is Act ${actNumber} of ${actCount}. The video is ONE continuous ${sheet.length}-beat argument, not ${actCount} variations on a shape. This Act carries ${
      first === last ? `beat ${first}` : `beats ${first} to ${last}`
    }, and nothing else.`,
    `Write them in this order as one unbroken stretch of narration. Do not label them, do not number them and do not announce them to the viewer.`,
    body.join("\n\n"),
  ];

  if (spent.length) {
    sections.push(
      `Earlier Acts have already spent the following. They are finished. Do not repeat them, do not re-establish them, and do not summarise them:\n${spent.join("\n")}`
    );
  }

  if (upcoming.length) {
    sections.push(
      `The following belong to LATER Acts. Do not write them here, do not preview them, and do not refer to them in passing:\n${upcoming.join("\n")}`
    );
  }

  return block("THIS ACT'S BEATS", sections.join("\n\n"));
}

/**
 * The Script Writer's system instruction.
 *
 * `lengthRule` stays a caller-supplied string because it is derived from the DurationProfile,
 * which is orthogonal to format: runtime tiers describe how long a video is, blueprints
 * describe what kind of video it is, and collapsing the two would mean re-declaring every
 * format at every duration.
 */
export function buildScriptWriterSystemInstruction(
  profile: FormatProfile,
  options: {
    lengthRule: string;
    /**
     * A device deterministically picked by `selectRotatingDevice` (Phase 7), rather
     * than left for the model to choose. Omitted callers — or an empty pool — fall
     * back to the original "choose one from the pool" instruction, so this is additive:
     * nothing regresses for a caller that hasn't wired rotation through.
     */
    selectedFramingDevice?: string | null;
    /**
     * The channel's verified fact ledger, frozen onto the project.
     *
     * Optional and additive, exactly like `selectedFramingDevice` above: absent or empty,
     * the compiled instruction is byte-identical to what it was before the ledger existed,
     * so a channel that has not built one is unaffected. Only VERIFIED facts should ever
     * arrive here — the filtering is the caller's job, since it is a database query, and
     * this module stays pure. See `resolveProjectFactLedger` in format-actions.ts.
     */
    facts?: readonly ChannelFact[];
    /**
     * Which Act of how many this request is writing — used to place `structure.arcBeats`.
     *
     * Both optional and additive, like everything else here: absent either one, no arc-beat
     * block is emitted and the instruction is what it was before. Single-pass short/mid-form
     * has one Act and no arc to spread beats across, so it simply omits them.
     */
    actNumber?: number;
    actCount?: number;
    /**
     * What earlier Acts of THIS video already covered. Optional and additive like the rest:
     * absent or empty (Act 1, single-pass, or an un-migrated database) emits no block.
     */
    continuity?: readonly ActContinuityEntry[];
  }
): string {
  const { identity, content, structure } = profile;

  // The original preamble sells a "highly visual, cinematic" channel, which actively
  // contradicts a format built on flat narration over archival stills — the model splits
  // the difference and drifts dramatic. A profile that declares a narrator gets a neutral
  // preamble instead; the migrated presets declare none, so they keep the original wording.
  const preamble = identity.narratorPersona
    ? "You are an expert Script Writer for a long-form, narration-led video channel."
    : "You are an expert Script Writer for a highly visual, cinematic video channel.";

  // The four numbered rules are the original prompt's shape and must stay in this order.
  const core = `
${preamble}
Your task is to write a master Voiceover (VO) script based on the provided parameters.

### CRITICAL RULES:
1. Tone: ${content.readingLevel} ${identity.register}
2. Structure: ${options.lengthRule}
${lineCompositionRule(profile)}
${closerRule(profile)}
`;

  // Everything below is additive. A migrated preset emits none of it.
  const persona = block("NARRATOR", identity.narratorPersona);

  // Placed immediately after NARRATOR and before any structural rule, because it governs
  // how each individual claim is unpacked rather than how the Act is shaped — the model
  // needs the reasoning move in hand before it reads the beats it must hit.
  const method = block(
    "HOW THIS NARRATOR EXPLAINS",
    identity.explanatoryMethod
      ? `Every claim in this script must be unpacked this way, without exception:
${identity.explanatoryMethod}`
      : ""
  );

  // Immediately after HOW THIS NARRATOR EXPLAINS and before anything about the viewer,
  // because it qualifies the register the model has just been given: `register` says the
  // narrator is urgent, and without this the model applies that urgency to the ancient
  // author too and writes him as awed. He is the one person in the script who is calm.
  const sourceVoice = block("HOW THE SOURCE SOUNDS", identity.sourceRegister);

  // Next to the source's voice on purpose: both answer "who is speaking, and what are they
  // like". Without it a channel with a fact ledger produces a bibliography — every name
  // correct, no name doing anything.
  const character = block("EVERY NAME IS A CHARACTER", identity.characterRule);

  // Placed right after HOW THIS NARRATOR EXPLAINS, because the two are easy to satisfy
  // independently and still produce a report: a narrator can reason exactly the right way
  // about every claim and never once speak TO the person listening. The fixed frequency
  // rule below is deliberate, not decorative prose — a 9-Act script that had the RIGHT
  // audienceStance text but no concrete count still addressed "you" in only 2 of 165 lines,
  // both at beats the pipeline already forces to exist. A number gets obeyed; a vibe does
  // not, which is the same reason WORDS_PER_NARRATION_LINE is a number and not a style note.
  const audience = block(
    "HOW THIS NARRATOR SPEAKS TO YOU",
    identity.audienceStance
      ? `${identity.audienceStance}

Concretely, in EVERY Act: address the viewer directly as "you" at least twice, and frame at least one claim as "we" — something the two of you are uncovering together. This must recur every Act; it is not satisfied by having done it in an earlier one.`
      : ""
  );

  const avoid = block(
    "REGISTERS TO AVOID",
    identity.forbiddenRegisters.length
      ? `The narration must never read as any of the following:\n${bullets(identity.forbiddenRegisters)}`
      : ""
  );

  // Supersedes ACT CYCLE and THIS ACT'S PLACE IN THE VIDEO when a profile declares a beat
  // sheet; empty for every profile that does not, which is every migrated preset.
  const spine = beatSheetBlock(profile, options);

  const cycle = block(
    "ACT CYCLE",
    structure.actCycle.length
      ? `This Act must run the full cycle below, in order. It is a self-contained loop, not a fragment of a larger arc — every Act opens its own question and closes on a new one.\n${bullets(
          structure.actCycle
        )}${
          structure.terminalRevelation
            ? "\n- Hold the single largest revelation back for the FINAL Act of the video. Do not spend it early."
            : ""
        }`
      : ""
  );

  // Both halves matter, and the second is the one that actually fixes the repetition.
  // Telling Act 4 what it must do leaves it free to also do what Acts 7, 8 and 9 are for —
  // which is exactly what happened when these beats were cycle beats: the suppression
  // chronology arrived in all nine Acts because nothing ever told any Act not to write it.
  const arc = block(
    "THIS ACT'S PLACE IN THE VIDEO",
    ((): string => {
      const { actNumber, actCount } = options;
      if (!actNumber || !actCount || !structure.arcBeats.length) return "";

      const assignments = assignArcBeats(profile, actCount);
      const mine = assignments.get(actNumber) ?? [];
      const reserved = [...assignments.entries()]
        .filter(([act]) => act !== actNumber)
        .sort(([a], [b]) => a - b);

      const lines = [`This is Act ${actNumber} of ${actCount}.`];

      if (mine.length) {
        lines.push(
          "",
          "In addition to the cycle above, this Act carries the following. Each happens ONCE in the whole video, and this is where:",
          bullets(mine.map((beat) => beat.instruction))
        );
      }

      if (reserved.length) {
        lines.push(
          "",
          "The following belong to OTHER Acts. Do not write them here, do not preview them, and do not refer to them in passing:",
          reserved
            .map(([act, beats]) =>
              beats.map((beat) => `- Act ${act}: ${beat.instruction}`).join("\n")
            )
            .join("\n")
        );
      }

      return lines.join("\n");
    })()
  );

  // `bannedOpenings` alone can only say what the opening must not be. A channel whose
  // opening is a fixed module — reproduced near-verbatim in every reference episode — needs
  // the positive half too, so `sequence` is emitted alongside it. Both empty (every migrated
  // preset) still produces no block at all.
  const coldOpen = block(
    "COLD OPEN",
    ((): string => {
      const { maxSeconds, payoffDeadlineSeconds, bannedOpenings, sequence } =
        structure.coldOpen;
      if (!bannedOpenings.length && !sequence.length) return "";

      // A video has one opening, and under a beat sheet it belongs to whichever Act holds
      // the cold-open beat. Sending this block to all nine Acts is how a six-step opening
      // module becomes a six-step module the writer tries to run nine times. Suppressed only
      // when a beat sheet is actually driving the structure — without one there is no Act
      // that "owns" the opening, so every Act keeps receiving it exactly as before.
      if (structure.beatSheet.length && (options.actNumber ?? 1) > 1) return "";

      const parts = [
        `The opening runs at most ${maxSeconds} seconds and must deliver one concrete, specific payoff within the first ${payoffDeadlineSeconds} seconds — a promise with no payoff reads as bait and is where viewers leave.`,
      ];

      if (sequence.length) {
        parts.push(
          `Run these steps in this order. This is the channel's opening and it is the same every episode — do not reorder it, do not merge steps, and do not skip one because it feels repetitive:\n${sequence
            .map((step, index) => `${index + 1}. ${step}`)
            .join("\n")}`
        );
      }

      if (bannedOpenings.length) {
        parts.push(`Never open with any of the following:\n${bullets(bannedOpenings)}`);
      }

      return parts.join("\n\n");
    })()
  );

  const apparatus = block("WHERE EVIDENCE TALK BELONGS", content.apparatusRule);
  const sensory = block("WHAT THE LISTENER FEELS", content.sensoryRule);
  const fragments = block("RHYTHM", content.fragmentRule);
  const scale = block("NUMBERS", content.scaleRule);

  // Separate from the per-beat `signpost`, which is bound to one beat and spent there.
  // These are the Act-to-Act handoffs, and the no-repeat rule is the whole point: a pool
  // used without one becomes a tic faster than having no pool at all.
  const transitions = block(
    "TRANSITIONS",
    content.transitionPhrases.length
      ? `When this Act turns from one idea to a worse one, use one of the following, word for word. Use at most one per Act, and never the same one twice in a video:\n${bullets(
          content.transitionPhrases
        )}\nNever hand off to the next Act with a neutral question. The listener must be told the next thing is worse than the last thing.`
      : ""
  );

  const beats = block(
    "REQUIRED BEATS",
    content.requiredBeats.length
      ? `This script must contain all of the following:\n${bullets(content.requiredBeats)}`
      : ""
  );

  const reHook = block(
    "RE-HOOK",
    structure.reHookIntervalSeconds > 0
      ? `Roughly every ${structure.reHookIntervalSeconds} seconds of narration, open a new loop before the previous one fully closes. Attention is held by the next unanswered question, never by the last answered one.`
      : ""
  );

  const sourcing = block("SOURCING", content.sourcingRule);

  // Immediately after SOURCING, which states the channel's citation policy in prose — the
  // ledger is that policy's enforceable half, and the two read as one instruction.
  const namedSources = namedSourcesBlock(options.facts ?? []);

  // The pool is still shown even when a device was pre-selected — the writer benefits
  // from seeing what it is NOT using, and it is what the rotation ledger cycles through
  // one entry at a time across Acts and videos (see selectRotatingDevice).
  const devices = block(
    "FRAMING DEVICE",
    !content.rotatingDevices.length
      ? ""
      : options.selectedFramingDevice
        ? `Build this script around the following framing device — it has already been chosen for you, to keep the channel from opening every episode the same way:\n"${options.selectedFramingDevice}"\n\nThe full pool this was drawn from, for reference only — do not use any of the others:\n${bullets(
            content.rotatingDevices
          )}`
        : `Choose ONE framing device for this script from the pool below, and build the script around it. Do not use more than one, and do not default to the same one every time — a channel whose every episode opens the same way reads as a single video repeated.\n${bullets(
            content.rotatingDevices
          )}`
  );

  const extra = block("ADDITIONAL DIRECTION", profile.additionalDirection ?? "");

  return (
    core +
    persona +
    method +
    sourceVoice +
    character +
    audience +
    avoid +
    // The spine REPLACES the cycle/arc pair rather than joining it. Sending both would hand
    // the model a shape to repeat and a shape to advance, and the repeatable one always
    // wins — it is concrete and scoped to this Act, while the spine is neither.
    // A profile with no beat sheet falls straight through to what it emitted before.
    (spine || cycle + arc) +
    // After whichever of those ran, on purpose: the two are read together — "this beat is
    // Act 8's" lands harder immediately alongside "and Laodicea was already named in Act 7".
    continuityBlock(options.continuity ?? []) +
    coldOpen +
    beats +
    apparatus +
    sensory +
    fragments +
    scale +
    transitions +
    reHook +
    sourcing +
    namedSources +
    devices +
    extra
  );
}

/* -------------------------------------------------------------------------- */
/*                               Act Outliner                                 */
/* -------------------------------------------------------------------------- */

/**
 * The "Structure Rules for an N-Act Video" block.
 *
 * The legacy branch describes ONE arc spread across the whole video: hook, setup,
 * escalation, payoff. The cycle branch instead makes every Act run the same complete loop,
 * which is the actual retention change — N hooks and N payoffs per video rather than one.
 * Returned as a block rather than a whole prompt so the surrounding text in
 * `generateActOutlines` is left exactly as it was.
 */
export function buildActStructureRules(
  profile: FormatProfile,
  actCount: number
): string {
  // The outliner has to see the same cut of the spine the Script Writer will, or it plans
  // N interchangeable chapters and each Act then discovers its real assignment on its own.
  // That is how a 9-Act outline ended up with the whole suppression chronology arriving in
  // Act 8 as a surprise, with no room budgeted for it.
  if (profile.structure.beatSheet.length) {
    const assignments = assignBeatSheet(profile, actCount);
    const sheet = profile.structure.beatSheet;
    const indexOf = new Map(sheet.map((beat, index) => [beat.id, index + 1]));

    const rows = Array.from({ length: actCount }, (_, i) => i + 1).map((act) => {
      const beats = assignments.get(act) ?? [];
      if (!beats.length) {
        // Reachable only for a sheet with fewer beats than Acts. Say so rather than
        // printing a bare Act number the outliner will pad with invented material.
        return `- Act ${act}: no beat of its own — fold it into the neighbouring Act rather than inventing content for it.`;
      }
      return `- Act ${act} carries ${beats
        .map((beat) => `beat ${indexOf.get(beat.id)}`)
        .join(" and ")}:\n${beats.map((beat) => `  - ${beatGist(beat)}`).join("\n")}`;
    });

    return `- This video is ONE continuous argument of ${sheet.length} beats, cut across ${actCount} Acts. It is NOT ${actCount} variations on a single shape, and no Act repeats another Act's structural move.
- Every Act does something the others do not. Write each Act's description around the specific beats it carries, and give a heavier Act more room in its description than a lighter one.
${rows.join("\n")}
- Do not plan a beat into an Act it was not assigned to, and do not have an Act preview or summarise another Act's beat.`;
  }

  if (!profile.structure.actCycle.length) {
    return `- Act 1: The "Curiosity Gap" / The Hook (Tell them what they will learn, withhold the answer).
- Act 2: The Setup / Context (Introduce players/conflict without infodumping).
- Acts 3 to ${actCount - 1}: The Escalation & Value Stacking (Introduce a NEW problem, contradiction, or plot twist in EVERY act. Do not just list events chronologically. Make the story evolve).
- Act ${actCount}: The Payoff & Conclusion (Deliver the ultimate answer, moral lesson, and CTA).`;
  }

  const cycle = profile.structure.actCycle
    .map((beat, index) => `  ${index + 1}. ${beat}`)
    .join("\n");

  const closing = profile.structure.terminalRevelation
    ? `- Act ${actCount} runs the same cycle, but its revelation is the largest one in the video — the answer every earlier Act circled without giving. Hold it back until here.`
    : `- Act ${actCount} runs the same cycle and resolves the video.`;

  // The outliner has to know where the once-only beats land, because the Act it assigns
  // them to needs enough room in its description to actually carry them. Without this the
  // outline plans N interchangeable chapters and the Script Writer then discovers, Act by
  // Act, that Act 8 was also supposed to hold the entire suppression chronology.
  const assignments = assignArcBeats(profile, actCount);
  const arc = assignments.size
    ? `\n- These beats happen ONCE in the video, at a fixed point. Write each assigned Act's description so it has room for its beat, and do not plan the beat into any other Act:\n${[
        ...assignments.entries(),
      ]
        .sort(([a], [b]) => a - b)
        .map(([act, beats]) =>
          beats.map((beat) => `  - Act ${act}: ${beat.instruction}`).join("\n")
        )
        .join("\n")}`
    : "";

  return `- EVERY Act, from 1 to ${actCount}, must run this complete cycle:
${cycle}
- Each Act is therefore a self-contained loop with its own hook and its own unanswered question. Do NOT spread a single arc across the video with one hook at the start.
- Act 1 additionally carries the video's cold open: its artifact must be the most concrete and most specific of all ${actCount}.
${closing}${arc}`;
}

/* -------------------------------------------------------------------------- */
/*                              Thumbnail Composer                            */
/* -------------------------------------------------------------------------- */

/**
 * Style guidance for the Thumbnail Composer, shared by the concept and final pass so
 * both read the channel's visual identity the same way rather than each re-deriving it.
 *
 * Reuses `visual.promptStyleTag`/`visualBias` (already used to keep scene prompts on-
 * brand) rather than introducing thumbnail-specific fields on FormatProfile — a
 * thumbnail is still this channel's visual identity, just applied to one hero image
 * instead of many scenes.
 */
export function compileThumbnailDirection(profile: FormatProfile): string {
  const lines = [
    `Match this channel's visual identity: ${profile.visual.promptStyleTag}.`,
    `Niche styling: ${profile.visual.visualBias}`,
  ];

  if (profile.identity.register) {
    lines.push(`The headline's tone should match the channel's register: ${profile.identity.register}`);
  }

  return block("CHANNEL VISUAL IDENTITY", lines.join("\n"));
}
