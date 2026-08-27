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
import { assignArcBeats, type FormatProfile } from "./format-profile";
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

  const coldOpen = block(
    "COLD OPEN",
    structure.coldOpen.bannedOpenings.length
      ? `The opening runs at most ${structure.coldOpen.maxSeconds} seconds and must deliver one concrete, specific payoff within the first ${structure.coldOpen.payoffDeadlineSeconds} seconds — a promise with no payoff reads as bait and is where viewers leave.\nNever open with any of the following:\n${bullets(
          structure.coldOpen.bannedOpenings
        )}`
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
    audience +
    avoid +
    cycle +
    arc +
    // After the arc block on purpose: the two are read together — "this beat is Act 8's"
    // lands harder immediately alongside "and Laodicea was already named in Act 7".
    continuityBlock(options.continuity ?? []) +
    coldOpen +
    beats +
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
