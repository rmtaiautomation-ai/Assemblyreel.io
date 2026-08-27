/**
 * The Channel Blueprint — the full format spec for one channel.
 * (implementation_plans/18-channel-blueprint.md)
 *
 * This is the successor to the Niche/Tone Matrix in `generation-rules.ts`. That matrix
 * could only express *word choice* ("Epic, NLT Bible style") and *shot selection*, and it
 * was reached by keyword-guessing on the free-text workspace theme — so a channel could
 * not choose its own narrative structure, its own vocal register, or its own TTS settings.
 * Running a second channel in a different niche meant editing code.
 *
 * A FormatProfile is data: presets ship in this file, the workspace stores a deep-partial
 * override on top, and each project freezes the resolved result. Nothing here reaches for
 * a provider or a database — it is a pure description that the agents compile into prompts
 * and that the TTS layer reads voice settings from.
 *
 * PHASE 1 NOTE: nothing consumes this module yet. The Niche/Tone Matrix is still live and
 * unmodified, so generation output is byte-identical to before this file existed. Wiring
 * happens in Phase 2 (text agents) and Phase 3 (TTS).
 */

import {
  NICHE_PROFILES,
  NARRATION_WORDS_PER_MINUTE,
  resolveNicheProfile,
  type NicheKey,
  type NicheProfile,
  type SceneType,
} from "./generation-rules";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/** Who the narrator is and how they sound. No equivalent existed before. */
export interface FormatIdentity {
  /** e.g. "an investigator reading aloud from a case file". */
  narratorPersona: string;
  /**
   * The lens every claim is explained through — the narrator's reasoning move, repeated.
   *
   * Distinct from `narratorPersona` (who is speaking) and `register` (how they sound),
   * because it governs what actually gets SAID. A psychology channel is not one that uses
   * psychology vocabulary; it is one where every event is explained by naming the mechanism
   * underneath it. Two narrators with identical persona and identical register produce
   * completely different scripts if one reasons by mechanism and the other by chronology.
   *
   * Also distinct from `structure.actCycle`, which is macro: the cycle shapes a whole Act,
   * this shapes each individual claim, sentence to sentence.
   *
   * Empty on every migrated preset, so their prompts stay byte-identical.
   */
  explanatoryMethod: string;
  /** e.g. "clinical, flat, matter-of-fact". Steers the words, not the synthesis. */
  register: string;
  /** Registers the writer must avoid. Negative constraints work better than adjectives. */
  forbiddenRegisters: readonly string[];
  /**
   * The narrator's relationship to the VIEWER — confiding and confrontational, or purely
   * expository. Distinct from `register` (how the narrator sounds) and `explanatoryMethod`
   * (how the narrator reasons about a claim): a script can get both of those right and
   * still read as a report, because every sentence is about the topic and none of them are
   * aimed at the person listening.
   *
   * Found missing only after listening to generated audio, not by reading the transcript
   * on a page: a 9-Act script with correct structure, correct citations and a working
   * closer still read as "someone reporting facts" rather than "someone telling you the
   * truth", because the ONLY sentences that spoke to the viewer directly were the two the
   * pipeline forces to exist (`personal-stake` and the closer's viewer-turn in
   * `structure.arcBeats`) — the other ~98% of the script never addressed "you" at all.
   * Direct address has to be a running habit across every Act, not a beat that fires once.
   *
   * `buildScriptWriterSystemInstruction` pairs this with a fixed, non-negotiable frequency
   * rule (see the `audience` block there) rather than leaving the count to prose alone —
   * the same lesson `WORDS_PER_NARRATION_LINE` already taught: a vague style instruction
   * ("vary your rhythm") gets ignored far more often than a concrete number does.
   *
   * Empty on every migrated preset, so their prompts stay byte-identical.
   */
  audienceStance: string;
}

/**
 * How the narration is *performed*.
 *
 * Split from `FormatIdentity` on purpose: `register` is prose guidance for the LLM, while
 * everything here is numeric configuration for a synthesis provider. Collapsing the two
 * into one field is the mistake `NicheProfile` already documents for `scriptTone` vs
 * `promptStyleTag`.
 */
export interface DeliverySpec {
  /** Overrides the module-wide NARRATION_WORDS_PER_MINUTE when estimating runtime. */
  wordsPerMinute: number;
  elevenlabs: {
    /** Higher = flatter and more consistent. The forensic register wants ~0.85. */
    stability: number;
    similarityBoost: number;
    /** Exaggeration. Omitted on models that do not accept it. */
    style?: number;
  };
  localTts: {
    speed?: number;
  };
  /**
   * Silence to place before a revelation beat, in milliseconds.
   *
   * NOT YET APPLIED. Honouring this requires emitting inline markers into the synthesis
   * text, and `synthesizeAndAlign` matches Deepgram's returned words against the scene
   * text with a five-word search window — a token present in the TTS input but absent from
   * the transcript desyncs alignment and silently shifts every later scene. Carried here so
   * presets can declare intent; applied once the spoken/alignment text split lands.
   */
  pauseBeforeRevelationMs: number;
  /** Whether verbatim quotations are audibly marked. Blocked by the same split as above. */
  quotationStyle: "spoken-marker" | "none";
}

/**
 * A beat that belongs to the VIDEO rather than to every Act.
 *
 * `actCycle` describes the shape EVERY Act repeats; this describes something that must
 * happen exactly ONCE, at a particular point in the runtime. The distinction was learned
 * the hard way: `forensic-documentary` originally carried "establish who removed or
 * restricted it, and when" and "present the modern echo" inside its `actCycle`, so a
 * 9-Act generation dutifully produced the Council of Laodicea in all nine Acts and nine
 * separate modern-parallel beats — two of which landed on the same parallel, because no
 * Act can see what the others wrote. The reference format they were modelled on spends
 * both exactly once, in its back third.
 *
 * Anything whose instruction contains "by Act N", "once", or "finally" is an arc beat,
 * not a cycle beat.
 */
export interface ArcBeat {
  /** Stable identifier. Not shown to the model; used in logs and tests. */
  id: string;
  /** The instruction handed to whichever Act this beat lands in. */
  instruction: string;
  /**
   * Where in the runtime it belongs: 0 is the first Act, 1 the last.
   *
   * A fraction rather than an Act number because Act count varies with the duration tier
   * (5 for a 10-15m video, 11 for 25-30m). `assignArcBeats` resolves it against the real
   * count, so one declaration works at every runtime.
   */
  position: number;
}

export interface FormatStructure {
  /**
   * The beats EVERY Act must contain, in order.
   *
   * An empty array means "use the pipeline's built-in whole-video arc" — one hook at the
   * start and one payoff at the end. That is the legacy behaviour, and every migrated
   * preset keeps it. A non-empty cycle makes each Act a self-contained loop instead, which
   * is the retention change the documentary format is built around: N hooks per video
   * rather than one.
   *
   * Keep this to beats that genuinely bear repeating N times. Everything else is an
   * `arcBeat` — see the ArcBeat doc comment for why that split exists.
   */
  actCycle: readonly string[];
  /** Video-level beats, each spent once, placed by `assignArcBeats`. */
  arcBeats: readonly ArcBeat[];
  coldOpen: {
    maxSeconds: number;
    /** The hook must pay off something concrete by this mark, or the promise reads as bait. */
    payoffDeadlineSeconds: number;
    bannedOpenings: readonly string[];
  };
  /** Withhold the largest reveal until the final Act. */
  terminalRevelation: boolean;
  /** How often to re-open a loop. 0 disables the instruction. */
  reHookIntervalSeconds: number;
  closer: "open-door" | "summary" | "cta";
}

export interface FormatContent {
  /**
   * `camera-ready` is the existing rule: every line must name a visible subject, action and
   * location, because every line becomes an image prompt. `documentary` relaxes it so lines
   * may carry dates, citations and named institutions that have no on-screen subject —
   * without this, an evidence-led format is impossible to write.
   */
  lineComposition: "camera-ready" | "documentary";
  readingLevel: string;
  /** Beats the video as a whole must contain, e.g. a personal-stake beat by Act 2. */
  requiredBeats: readonly string[];
  /** How sources may be cited, and what may not be asserted as fact. */
  sourcingRule: string;
  /**
   * Framing devices the writer must vary between videos.
   *
   * A format like this needs a recurring "here is the moment it was hidden" beat, but
   * reusing the same one every episode is what makes a back catalogue sound like a single
   * video. The pool is declared here; non-repetition across projects is enforced by the
   * round-robin cursor in `selectRotatingDevice` / `consumeRotationCursor`.
   */
  rotatingDevices: readonly string[];
}

export interface FormatVisual {
  /** Shot-selection guidance for the Scene Slicer. Was NicheProfile.visualBias. */
  visualBias: string;
  /**
   * Short keywords safe to concatenate into an image/video prompt.
   *
   * Was NicheProfile.promptStyleTag, and kept separate from prose guidance for the same
   * reason: a diffusion model renders "NLT Bible style" literally.
   */
  promptStyleTag: string;
  preferredSceneTypes: readonly SceneType[];
  /** How stills are treated — the archival look a narration-led channel lives on. */
  stillTreatment: string;
}

export interface FormatProfile {
  key: string;
  label: string;
  /** Bumped by the workspace on every save; stamped onto each project. */
  version: number;
  identity: FormatIdentity;
  delivery: DeliverySpec;
  structure: FormatStructure;
  content: FormatContent;
  visual: FormatVisual;
  /**
   * Freeform direction, appended last when the prompt is assembled.
   *
   * Deliberately the ONLY unstructured field. A blueprint made entirely of prose gets
   * weighted unpredictably by the model, cannot be changed one variable at a time, and
   * drifts unnoticed across dozens of edits — which is the exact failure this module
   * exists to prevent.
   */
  additionalDirection?: string;
  /**
   * The raw research or brief this profile was generated from, kept as provenance.
   *
   * PROVENANCE ONLY — never compiled into a prompt. Feeding the source prose back to the
   * Script Writer would reintroduce the freeform blob that `additionalDirection`'s comment
   * above exists to argue against. It is stored so the user can see what produced a format
   * and re-run the analyst to refine it, and it rides along into each project's frozen
   * snapshot so a finished video records the brief it came from.
   */
  sourceBrief?: string;
}

/** A workspace stores only what it changed. Arrays replace wholesale; they never merge. */
export type FormatProfileOverride = {
  identity?: Partial<FormatIdentity>;
  delivery?: Partial<Omit<DeliverySpec, "elevenlabs" | "localTts">> & {
    elevenlabs?: Partial<DeliverySpec["elevenlabs"]>;
    localTts?: Partial<DeliverySpec["localTts"]>;
  };
  structure?: Partial<Omit<FormatStructure, "coldOpen">> & {
    coldOpen?: Partial<FormatStructure["coldOpen"]>;
  };
  content?: Partial<FormatContent>;
  visual?: Partial<FormatVisual>;
  additionalDirection?: string;
  sourceBrief?: string;
};

/* -------------------------------------------------------------------------- */
/*                              Built-in presets                              */
/* -------------------------------------------------------------------------- */

export const FORMAT_PRESET_KEYS = [
  "forensic-documentary",
  "mythic-epic",
  "grounded-investigation",
  "dark-psychology",
  "general",
  // Not a shipped format — the slot a workspace's own generated profile occupies. The
  // workspace's `format_blueprint` holds a FULL profile rather than a diff in this case,
  // which `mergeFormatProfile` handles for free because it merges by spread. This is what
  // makes a new channel a paste rather than a code change.
  "custom",
] as const;

export type FormatPresetKey = (typeof FORMAT_PRESET_KEYS)[number];

/**
 * Voice settings matching what `elevenlabs.ts` hardcodes today.
 *
 * Every migrated preset carries these exact numbers so that switching synthesis over to
 * blueprint-driven settings in Phase 3 cannot change the sound of an existing channel.
 * Only the new `forensic-documentary` preset departs from them.
 */
const LEGACY_ELEVENLABS = { stability: 0.5, similarityBoost: 0.5 };

/**
 * The rules the Script Writer and Act Outliner hardcode today, expressed as data.
 *
 * Migrated presets inherit this wholesale, which is what makes Phase 2 a refactor rather
 * than a behaviour change: compiling these fields back into a prompt has to reproduce the
 * existing instruction text.
 */
const LEGACY_DELIVERY: DeliverySpec = {
  wordsPerMinute: NARRATION_WORDS_PER_MINUTE,
  elevenlabs: LEGACY_ELEVENLABS,
  localTts: {},
  pauseBeforeRevelationMs: 0,
  quotationStyle: "none",
};

const LEGACY_STRUCTURE: FormatStructure = {
  // Empty: keep the built-in whole-video arc (curiosity gap, setup, escalation, payoff and
  // CTA) rather than imposing a per-Act cycle.
  actCycle: [],
  // Empty for the same reason every other new field is: the prompt builder emits the block
  // only when this is populated, so migrated presets stay byte-identical.
  arcBeats: [],
  coldOpen: { maxSeconds: 5, payoffDeadlineSeconds: 5, bannedOpenings: [] },
  terminalRevelation: true,
  reHookIntervalSeconds: 0,
  closer: "cta",
};

const LEGACY_CONTENT: Omit<FormatContent, "lineComposition"> & {
  lineComposition: FormatContent["lineComposition"];
} = {
  // Script Writer CRITICAL RULE 3 as it stands today.
  lineComposition: "camera-ready",
  readingLevel: "Plain English, 8th-grade reading level.",
  requiredBeats: [],
  sourcingRule: "",
  rotatingDevices: [],
};

/** Lifts a legacy NicheProfile into the visual half of a FormatProfile. */
function visualFromNiche(niche: NicheProfile): FormatVisual {
  return {
    visualBias: niche.visualBias,
    promptStyleTag: niche.promptStyleTag,
    preferredSceneTypes: niche.preferredSceneTypes,
    stillTreatment: "",
  };
}

/**
 * Builds a preset that reproduces today's behaviour for one niche.
 *
 * Derived from NICHE_PROFILES rather than retyped. generation-rules.ts already carries a
 * comment about hand-copied niche logic drifting out of sync with the real values;
 * duplicating those strings here — even for the one phase before the matrix is retired —
 * would repeat exactly that mistake.
 */
function migratedPreset(
  key: FormatPresetKey,
  label: string,
  nicheKey: NicheKey
): FormatProfile {
  const niche = NICHE_PROFILES[nicheKey];
  return {
    key,
    label,
    version: 1,
    identity: {
      // Deliberately empty, like every other "legacy = empty" field here. The prompt
      // builder emits a persona block only when this is set, so leaving it blank is what
      // keeps a migrated preset's system instruction byte-identical to the pre-blueprint
      // one. These channels express their persona through `register` (the old scriptTone);
      // a channel that wants a real persona sets it in its workspace blueprint.
      narratorPersona: "",
      explanatoryMethod: "",
      register: niche.scriptTone,
      forbiddenRegisters: [],
      audienceStance: "",
    },
    delivery: LEGACY_DELIVERY,
    structure: LEGACY_STRUCTURE,
    content: LEGACY_CONTENT,
    visual: visualFromNiche(niche),
  };
}

/**
 * The new one: a narration-led, evidence-shaped documentary format.
 *
 * Every field that differs from the legacy defaults is a deliberate choice:
 *
 *  - `register` is high-stakes but grounded. The first draft of this preset was flat and
 *    clinical ("the tone used to write a property deed"), which turned out to contradict
 *    the niche research it was derived from: established channels in this format are
 *    serious, urgent and revelatory, not affectless. Flat delivery suppressed the exact
 *    quality that makes the format hold attention. What it keeps from that first draft is
 *    the ban on hype — the weight is meant to come from the evidence, not from adjectives,
 *    which is also the only register honestly compatible with `sourcingRule` below.
 *  - `explanatoryMethod` is the reasoning move, repeated every claim. Without it a channel
 *    set to "an archivist" produces generic documentary narration in an archivist's voice.
 *  - `stability` stays high: a synthetic voice audibly breaks on high-affect narration, so
 *    urgency has to come from word choice rather than from performance.
 *  - `lineComposition` is `documentary`, without which no line may name a date, a source
 *    or an institution.
 *  - `actCycle` is non-empty, turning one hook per video into one per Act. It holds only
 *    the three beats that bear repeating; the beats that must be spent once live in
 *    `arcBeats`, which is the fix for a generated 9-Act script that named the Council of
 *    Laodicea in all nine Acts and ran six separate modern-parallel beats.
 *  - `rotatingDevices` exists so the recurring "moment it was hidden" beat varies between
 *    episodes instead of becoming the channel's tic.
 */
const FORENSIC_DOCUMENTARY: FormatProfile = {
  key: "forensic-documentary",
  label: "Forensic Documentary",
  version: 1,
  identity: {
    narratorPersona:
      "An archivist working through recovered documents, showing the viewer what the record actually says. Not a preacher, not a prophet, not a conspiracy host. Treats the viewer as a fellow researcher, never as a congregation.",
    explanatoryMethod:
      "Explain by evidence chain. Point at a physical object, say what it contains, name who removed or restricted it and when, then show what it resembles today — framed as resemblance, never as proof.",
    register:
      "Serious and urgent, but grounded. Treat the material as consequential and unresolved, never as settled inspiration. State extraordinary claims plainly — the weight comes from the evidence, not from adjectives. Never Sunday-school gentle, never breathless.",
    forbiddenRegisters: [
      "sermonising or altar-call language",
      "Sunday-school gentleness or devotional warmth",
      "hype and clickbait phrasing",
      "ranting, or naming a present-day conspiracy",
      "asserting a scientific finding that does not exist",
    ],
    audienceStance:
      "This is an investigation the narrator and the viewer are running together, not a lecture. Speak to the viewer directly as \"you\" throughout, and frame the shared work as \"we\" — what we have to confront, what we are being shown. When a claim would make a skeptical viewer doubt it, meet that doubt head-on before they can voice it: state the claim's truth plainly rather than only presenting evidence and moving on. The viewer should feel told something real, not informed of something interesting.",
  },
  delivery: {
    wordsPerMinute: 135,
    elevenlabs: { stability: 0.85, similarityBoost: 0.6, style: 0.15 },
    localTts: { speed: 0.95 },
    pauseBeforeRevelationMs: 1000,
    quotationStyle: "spoken-marker",
  },
  structure: {
    // Three beats, not five. The suppression beat and the modern-echo beat used to live
    // here; see the ArcBeat doc comment for what that produced across nine Acts.
    actCycle: [
      "Open on a physical artifact — an object, a fragment, a place that can be pointed at.",
      "State plainly what it says or contains, and unpack ONE specific detail — a single word in the original language, a measurement, a material — against what the reader expects it to mean.",
      "Close the Act on a door that stays shut, and name the question the next Act answers.",
    ],
    arcBeats: [
      {
        id: "vindication",
        // The reversal that earns the text its authority, and the reason the cold open
        // is not merely a curiosity. Stating the copy count without the comparison is
        // what makes it land as trivia instead.
        instruction:
          "Spend the vindication beat: the suppressed text is better attested than the canon that excluded it. Give the manuscript count and compare it directly to books that were kept — the comparison is the point, not the number.",
        position: 0.05,
      },
      {
        id: "personal-stake",
        instruction:
          "Convert the historical claim into a statement about what the viewer is, or what is true of them right now. Once, plainly, without addressing them as an audience.",
        position: 0.2,
      },
      {
        id: "modern-echo",
        // Exactly one. Nine of these is what a five-beat cycle produced, and two of the
        // nine duplicated each other because no Act can see what the others wrote.
        instruction:
          "Spend the video's ONE modern-parallel beat here: a documented, named, contemporary finding that resembles what the text describes. Give the researcher, the institution, the publication and the year. Frame it as resemblance, never as confirmation. This beat appears nowhere else in the video.",
        position: 0.7,
      },
      {
        id: "suppression-chronology",
        instruction:
          "Spend the video's ONE suppression beat here, as a chronology in fixed order: the council or authority that excluded the text and when, the figures who argued against it afterwards and what each actually said, the tradition that preserved it anyway, and its eventual re-emergence. Name no council or figure that any earlier Act already named.",
        position: 0.8,
      },
      {
        id: "live-suppression",
        // The beat that moves the argument from history into the present tense, and the
        // single strongest retention device in the reference format.
        instruction:
          "Show that the restriction is still unresolved today: an access request, a review period, a stated reason, and the absence of a timeline. Report the facts adjacent to one another and draw no conclusion from them.",
        position: 0.88,
      },
      {
        id: "disclaimer",
        // The credibility firewall. Conceding the maximalist reading is what buys
        // permission for the actual one — but only if it happens once. Four uses across
        // six Acts, three of them sharing the phrase "a literal blueprint", read as a tic.
        instruction:
          "Concede the maximalist reading once, in the first person — the only first-person moment in the video. Grant that the text passed through centuries of transmission and that what its author meant may exceed recovery. Then state what the text nevertheless says. Do not use this concession in any other Act.",
        position: 0.95,
      },
    ],
    coldOpen: {
      maxSeconds: 45,
      // A promise with no payoff inside 30s is the largest retention drop in this format:
      // viewers leave during the setup, not during the content.
      payoffDeadlineSeconds: 30,
      bannedOpenings: [
        "greetings of any kind",
        "channel or host introductions",
        "any statement of intent such as announcing what the video will cover",
        "music-only or logo intros",
      ],
    },
    terminalRevelation: true,
    reHookIntervalSeconds: 100,
    closer: "open-door",
  },
  content: {
    lineComposition: "documentary",
    readingLevel:
      "Plain English, but precise. Prefer the specific noun over the general one.",
    // Genuinely per-Act. The personal-stake beat used to sit here, but "by the end of Act
    // 2" is a positional instruction and this block is emitted into EVERY Act's prompt —
    // so it is an arcBeat now.
    requiredBeats: [
      "At least one verbatim quotation from the primary source per Act, cited by chapter and verse.",
      "A re-hook roughly every 100 seconds.",
    ],
    sourcingRule:
      "Quote real text, cite real fragments and real named scholars. Frame any modern parallel as a resemblance, not a confirmation. Never attribute a finding to an institution that did not publish it, and never invent a study, a date, or a manuscript.",
    rotatingDevices: [
      "a canon list that omits the text",
      "a translation that disagrees with the received wording",
      "a fragment that survives only in one collection",
      "a manuscript never photographed or published",
      "a church council that declined to include it",
      "a language in which the text stayed canonical",
      "a passage quoted by an early writer but missing from later copies",
    ],
  },
  visual: {
    visualBias:
      "Favor 'ESTABLISH' and 'MACRO' scene types. Archival stills over action: documents, manuscript surfaces, maps, artifacts held still. Let shots linger.",
    promptStyleTag:
      "archival documentary photography, desaturated palette, low warm key light, aged paper and parchment texture",
    preferredSceneTypes: ["ESTABLISH", "MACRO", "CLOSEUP"],
    stillTreatment:
      "Dim, desaturated, slow push. 5-8 seconds per image. No fast cuts, no dramatic zooms.",
  },
};

/**
 * The base a generated profile is merged over.
 *
 * A workspace on `custom` stores a FULL profile in `format_blueprint` rather than a diff, so
 * in practice every field here is replaced. It exists so that a partially-written custom row
 * — or one saved before a future field was added — still resolves to something coherent
 * rather than throwing. `general`'s legacy defaults are the safest possible floor: they are
 * exactly the pre-blueprint behaviour.
 */
const CUSTOM_BASE: FormatProfile = {
  ...migratedPreset("general", "Custom — built from your research", "general"),
  key: "custom",
  structure: {
    ...LEGACY_STRUCTURE,
    // LEGACY_STRUCTURE's 5/5 is only safe because migrated presets leave `bannedOpenings`
    // empty, and the prompt builder emits the COLD OPEN block ONLY when that array is
    // populated — so the 5 never reaches a model. A generated format almost always fills
    // bannedOpenings, which switches the block on and would instruct the writer that "the
    // opening runs at most 5 seconds": nonsense that would deform every script. These are
    // the durations the analyst's own schema calls typical, used when a brief is silent.
    coldOpen: { maxSeconds: 45, payoffDeadlineSeconds: 30, bannedOpenings: [] },
  },
};

export const FORMAT_PRESETS: Record<FormatPresetKey, FormatProfile> = {
  "forensic-documentary": FORENSIC_DOCUMENTARY,
  "mythic-epic": migratedPreset("mythic-epic", "Mythic Epic", "mythology"),
  "grounded-investigation": migratedPreset(
    "grounded-investigation",
    "Grounded Investigation",
    "true-crime"
  ),
  "dark-psychology": migratedPreset("dark-psychology", "Dark Psychology", "dark-psychology"),
  general: migratedPreset("general", "General", "general"),
  custom: CUSTOM_BASE,
};

/**
 * Preset keys a user may pick from the settings dropdown.
 *
 * `custom` is excluded: it is not a format you choose, it is the slot a generated profile
 * lands in. Picking it from a dropdown would reset the section to `general`'s defaults,
 * which is the opposite of what the label promises.
 */
export const SELECTABLE_FORMAT_PRESET_KEYS = FORMAT_PRESET_KEYS.filter(
  (key) => key !== "custom"
) as readonly Exclude<FormatPresetKey, "custom">[];

/**
 * Maps the legacy keyword-matched niche onto its migrated preset.
 *
 * `custom` deliberately has no entry and must never gain one — a legacy row with no
 * `format_preset_key` must fall back to a real shipped format, never into the custom slot,
 * whose base is empty until a workspace writes a full profile into it.
 */
const PRESET_BY_NICHE_KEY: Record<NicheKey, FormatPresetKey> = {
  mythology: "mythic-epic",
  "true-crime": "grounded-investigation",
  "dark-psychology": "dark-psychology",
  general: "general",
};

/* -------------------------------------------------------------------------- */
/*                                 Resolution                                 */
/* -------------------------------------------------------------------------- */

export function isFormatPresetKey(value: unknown): value is FormatPresetKey {
  return (
    typeof value === "string" &&
    (FORMAT_PRESET_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Merges a workspace's stored diff over its preset.
 *
 * Section by section rather than a generic recursive merge, so the result stays exactly
 * typed and array semantics are unambiguous: an overridden array REPLACES the preset's.
 * Concatenating would make it impossible to remove a banned opening or shrink a device
 * pool once a preset had listed it.
 */
export function mergeFormatProfile(
  preset: FormatProfile,
  override?: FormatProfileOverride | null
): FormatProfile {
  if (!override) return preset;

  return {
    ...preset,
    identity: { ...preset.identity, ...override.identity },
    delivery: {
      ...preset.delivery,
      ...override.delivery,
      elevenlabs: { ...preset.delivery.elevenlabs, ...override.delivery?.elevenlabs },
      localTts: { ...preset.delivery.localTts, ...override.delivery?.localTts },
    },
    structure: {
      ...preset.structure,
      ...override.structure,
      coldOpen: { ...preset.structure.coldOpen, ...override.structure?.coldOpen },
    },
    content: { ...preset.content, ...override.content },
    visual: { ...preset.visual, ...override.visual },
    additionalDirection: override.additionalDirection ?? preset.additionalDirection,
    sourceBrief: override.sourceBrief ?? preset.sourceBrief,
  };
}

/**
 * Resolves the profile a generation run should use.
 *
 * Order: explicit preset key, then a keyword match on the workspace theme, then general.
 *
 * The keyword path exists ONLY for workspaces created before `format_preset_key` did. It
 * reuses `resolveNicheProfile` rather than reimplementing the match, because a second copy
 * of that keyword chain drifting out of sync with the first is precisely the bug
 * generation-rules.ts was written to fix.
 */
export function resolveFormatProfile(params: {
  presetKey?: string | null;
  blueprintOverride?: FormatProfileOverride | null;
  nicheTheme?: string | null;
  /** The workspace's format_blueprint_version, stamped onto the resolved profile. */
  version?: number | null;
}): FormatProfile {
  const presetKey = isFormatPresetKey(params.presetKey)
    ? params.presetKey
    : PRESET_BY_NICHE_KEY[resolveNicheProfile(params.nicheTheme).key];

  const merged = mergeFormatProfile(
    FORMAT_PRESETS[presetKey],
    params.blueprintOverride
  );

  return params.version != null ? { ...merged, version: params.version } : merged;
}

/* -------------------------------------------------------------------------- */
/*                        Arc beats — structure.arcBeats                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolves each arc beat's fractional `position` against a real Act count.
 *
 * Pure and shared on purpose: the Act Outliner is told which Act will carry each beat so
 * it can plan around them, and the Script Writer is told which beats THIS Act carries.
 * Both call this, so the outline and the script cannot disagree about where the modern
 * echo lives — a second copy of this arithmetic drifting out of sync with the first is
 * the bug `resolveNicheProfile` already exists to document.
 *
 * `floor(position * actCount) + 1` rather than rounding, because it distributes the way
 * the format intends at every tier: at 9 Acts the six forensic beats land on Acts
 * 1, 2, 7, 8, 8 and 9. Several beats sharing one Act is expected and correct — suppression
 * and its still-unresolved present-day tail belong together.
 *
 * Returns a Map keyed by Act number; Acts with no beats are absent rather than empty.
 */
export function assignArcBeats(
  profile: FormatProfile,
  actCount: number
): Map<number, ArcBeat[]> {
  const assignments = new Map<number, ArcBeat[]>();
  if (actCount < 1) return assignments;

  for (const beat of profile.structure.arcBeats) {
    // Clamp rather than trust the data: a hand-edited blueprint or a generated profile
    // could carry a position outside 0-1, and an out-of-range Act number would silently
    // drop the beat from every Act instead of failing visibly.
    const clamped = Math.min(Math.max(beat.position, 0), 1);
    const actNumber = Math.min(actCount, Math.floor(clamped * actCount) + 1);

    const existing = assignments.get(actNumber);
    if (existing) existing.push(beat);
    else assignments.set(actNumber, [beat]);
  }

  return assignments;
}

/* -------------------------------------------------------------------------- */
/*                       Rotation — content.rotatingDevices                   */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic round-robin pick from a profile's framing-device pool.
 * (implementation_plans/18-channel-blueprint.md, Phase 7)
 *
 * Pure and I/O-free on purpose: `cursor` is read from and written back to
 * `workspaces.rotation_cursor` by the caller (see `format-actions.ts`), so this
 * function can be exercised directly without a database. Wraps rather than clamps,
 * so a shrinking pool (a preset edit that removes devices) cannot push the cursor out
 * of range and produce `undefined`.
 */
export function selectRotatingDevice(
  profile: FormatProfile,
  cursor: number
): { device: string | null; index: number } {
  const pool = profile.content.rotatingDevices;
  if (pool.length === 0) return { device: null, index: 0 };

  const index = ((cursor % pool.length) + pool.length) % pool.length;
  return { device: pool[index], index };
}
