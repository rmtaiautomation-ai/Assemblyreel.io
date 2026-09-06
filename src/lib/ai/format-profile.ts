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
  /**
   * How the SOURCE sounds, as distinct from how the narrator sounds.
   *
   * `register` describes the narrator. This describes the voice the narrator is quoting —
   * and collapsing the two is a real failure mode, not a hypothetical one. This preset's
   * `register` was first drafted as "the tone used to write a property deed" and correctly
   * rejected as too flat for a narrator. The reference channel uses that exact simile, but
   * about the ancient author: "He recorded it with the same matter-of-fact tone you'd use
   * writing a property deed." An urgent narrator quoting a deadpan source is where the
   * format's weight comes from; one voice doing both loses it in either direction.
   *
   * Empty on every migrated preset, so their prompts stay byte-identical.
   */
  sourceRegister: string;
  /**
   * What a named person is FOR.
   *
   * Without this a channel with a fact ledger produces a bibliography: nine Acts naming
   * Knibb, VanderKam, Nickelsburg and Isaac, none of whom wants anything, hides anything
   * or pays a price. Every scholar in the reference episodes has a choice attached —
   * Charles softened three passages his own footnotes admit were deliberate, Milik sat on
   * the fragments for 29 years, Bechtel walked out with the master negatives. Those are the
   * characters; there are no others in this format.
   *
   * Empty on every migrated preset, so their prompts stay byte-identical.
   */
  characterRule: string;
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
   * OpenAI TTS (`gpt-4o-mini-tts`). Optional — absent, synthesis uses a neutral
   * default voice and no style instruction, so a preset that never set this keeps
   * behaving exactly as before OpenAI was an option.
   */
  openai?: {
    /**
     * One of OpenAI's named voices: alloy, ash, ballad, coral, echo, fable, onyx,
     * nova, sage, shimmer, verse. Overridden by the channel's saved
     * `narration_voice_id` when that is itself a valid OpenAI voice.
     */
    voice?: string;
    /**
     * Plain-English delivery direction the model is steered by, e.g. "calm, grave,
     * documentary narrator; unhurried pace; no upspeak". This is where a channel's
     * spoken register is dialled in for `gpt-4o-mini-tts`.
     */
    instructions?: string;
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

/**
 * One step of the video's fixed spine. See `FormatStructure.beatSheet`.
 *
 * Ordered by array position, not by a fractional `position` like `ArcBeat` — the whole
 * point of a spine is that beat 12 follows beat 11, and a set of independent fractions
 * cannot express "these two are adjacent" without the author hand-tuning numbers that
 * then break at a different Act count.
 */
export interface Beat {
  /** Stable identifier. Not shown to the model; used in logs and tests. */
  id: string;
  /** The instruction handed to whichever Act this beat lands in. */
  instruction: string;
  /**
   * Share of runtime relative to the other beats. Defaults to 1.
   *
   * Unequal weighting is a finding, not a nicety: the reference format compresses three
   * of the seven heavens into a single paragraph and then spends four sentences turning
   * over one detail about a door. Equal weight across beats is what makes a script read as
   * an itinerary rather than an argument.
   */
  weight?: number;
  /**
   * The verbatim line that opens this beat, where the channel has one.
   *
   * Bound to the beat rather than pooled, because that is how the reference channel
   * actually uses them: "Now, here's where it gets active" introduces the still-restricted
   * beat in all three episodes analysed, never anything else. A free-floating pool would
   * let the model spend the phrase in the wrong place, which is worse than not having it.
   */
  signpost?: string;
  /**
   * Whether manuscript / edition / translator / fragment-number talk is allowed here.
   *
   * Defaults to false. Apparatus is the format's credibility layer and also the thing that
   * kills it when spread evenly: a generated 9-Act script ran ~42% apparatus in EVERY Act,
   * while the reference concentrates it in the opening and the suppression block and runs
   * near zero through the middle. See `FormatContent.apparatusRule`.
   */
  apparatus?: boolean;
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
  /**
   * The ordered beat sheet for the WHOLE video — the successor to `actCycle` + `arcBeats`.
   *
   * When this is non-empty it REPLACES both of them: `assignBeatSheet` cuts it into
   * contiguous runs and hands each Act its own slice, so Act 4 and Act 8 are given
   * genuinely different work. When it is empty nothing changes, which is what keeps every
   * migrated preset byte-identical.
   *
   * Why it had to exist: `actCycle` can only express "repeat this shape N times", and a
   * 9-Act generation of the forensic format therefore opened all nine Acts on a manuscript
   * and closed seven of them on a door slamming shut. It did exactly as instructed. Research
   * across three episodes of the reference channel found no repeating per-Act shape at all —
   * one fixed ~17-beat spine, run once, no structural move used twice. `arcBeats` was an
   * attempt at that spine, but as a sparse overlay on a cycle it could only ever say "this
   * one thing also happens here" while the cycle kept driving the Act's actual shape.
   */
  beatSheet: readonly Beat[];
  coldOpen: {
    maxSeconds: number;
    /** The hook must pay off something concrete by this mark, or the promise reads as bait. */
    payoffDeadlineSeconds: number;
    bannedOpenings: readonly string[];
    /**
     * The opening's ordered steps, stated as instructions.
     *
     * `bannedOpenings` is the negative half and was all that existed: it can stop the
     * writer opening with a greeting, but it cannot produce the reference channel's actual
     * opening, which is a fixed six-step module reproduced almost verbatim every episode.
     * Emitted only when non-empty, so a preset without one keeps the old behaviour.
     */
    sequence: readonly string[];
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
  /**
   * Where manuscript / edition / translator talk is allowed, and where it is not.
   *
   * The single largest difference measured between a generated script and the reference.
   * Act 3 of a generated 9-Act video spent its first eight scenes of nineteen on the
   * manuscript, the Greek word and the translation history before anything happened; the
   * reference reaches "It is described as a prison" in one sentence and drops the Ge'ez
   * term in mid-paragraph as garnish. Same beat, same research, opposite ordering — and it
   * is the ordering the ear hears as "documentary" rather than "story".
   *
   * Stated as its own rule rather than folded into `sourcingRule` because the two say
   * opposite-facing things: sourcing is about what may be NAMED, this is about where naming
   * may HAPPEN. A script can satisfy sourcing perfectly and still be unlistenable.
   */
  apparatusRule: string;
  /**
   * Physical sensation in the spoken line, not only in the image prompt.
   *
   * Found by listening rather than reading: a generated script's Visual Prompts were full
   * of texture — frost, basalt, candlelight — while its narration described documents for
   * 141 consecutive lines. On a page the scene reads as rich. Through headphones the
   * listener gets nothing to feel, because the only channel they have is the voice.
   */
  sensoryRule: string;
  /**
   * How line length is broken.
   *
   * `lineComposition` already asks for varied length and is routinely ignored, because
   * "vary your rhythm" is a vibe and the word-count target beside it is a number. This
   * names the specific short form the reference actually uses — antithesis, "not X, Y" —
   * which is concrete enough to be obeyed and, unlike a bare fragment, still survives
   * becoming one scene with one image behind it.
   */
  fragmentRule: string;
  /**
   * Turning figures into something a listener can picture.
   *
   * The reference never states a measurement without converting it in the same breath —
   * "30 cubits. A cubit is roughly 18 in. 30 cubits is 45 ft." The generated script's
   * equivalent beat said "over one hundred surviving Geez manuscripts" against "a minimal
   * fraction", which is the same claim with nothing for the ear to hold on to.
   */
  scaleRule: string;
  /**
   * Handoff lines between Acts, drawn from without repetition.
   *
   * Distinct from `Beat.signpost`, which is bound to one beat and spent there. These float:
   * they mark that the next thing is worse than the last thing, which is how the reference
   * escalates. A generated script's Act transitions were all neutral questions ("Where are
   * the vast agricultural resources...?"), so nothing ever told the listener it was getting
   * worse — the difference between an argument and an itinerary.
   */
  transitionPhrases: readonly string[];
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
  /**
   * Off by default for every existing and future channel — the Scene Slicer keeps
   * today's behaviour, cutting to a target seconds-per-scene band, unless a channel
   * opts in here.
   *
   * On, the slicer instead counts the distinct visual ideas a stretch of narration
   * actually AFFIRMS and cuts on that — never inventing a shot for a concept the line
   * denies ("not a trial, not a choir" gets no trial and no choir on screen), and never
   * forcing a second image where the sentence only has one. A duration target is a
   * proxy for "how many pictures does this line need"; this rule answers that question
   * directly instead of guessing from length.
   */
  contentAwareSlicing: boolean;
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
  beatSheet: [],
  coldOpen: { maxSeconds: 5, payoffDeadlineSeconds: 5, bannedOpenings: [], sequence: [] },
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
  apparatusRule: "",
  sensoryRule: "",
  fragmentRule: "",
  scaleRule: "",
  transitionPhrases: [],
};

/** Lifts a legacy NicheProfile into the visual half of a FormatProfile. */
function visualFromNiche(niche: NicheProfile): FormatVisual {
  return {
    visualBias: niche.visualBias,
    promptStyleTag: niche.promptStyleTag,
    preferredSceneTypes: niche.preferredSceneTypes,
    stillTreatment: "",
    contentAwareSlicing: false,
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
      sourceRegister: "",
      characterRule: "",
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
    sourceRegister:
      "The narrator is urgent. The ancient author is not. Whenever you describe what he wrote, note his flatness: he records what he saw and does not explain it, the way a first responder writes down what was in the room, or the way anyone writes a property deed. He is never awed, never poetic, never reverent. The gap between an urgent narrator and a deadpan source is where this format's weight comes from.",
    characterRule:
      "Every named person is a character, not a citation. Each one gets a choice, a motive or a consequence attached: what they decided, what they left out, what it cost them, what they would not explain. A translator who softened three passages his own footnotes admit were deliberate. An editor who held the fragments for twenty-nine years. A scholar whose edition was never reprinted. Never introduce a name without saying what that person DID about it — a name that only supports a claim has been wasted.",
  },
  delivery: {
    wordsPerMinute: 135,
    elevenlabs: { stability: 0.85, similarityBoost: 0.6, style: 0.15 },
    localTts: { speed: 0.95 },
    pauseBeforeRevelationMs: 1000,
    quotationStyle: "spoken-marker",
  },
  structure: {
    // Both empty on purpose, and both superseded by `beatSheet` below.
    //
    // `actCycle` held three beats that every Act repeated. That is what a 9-Act generation
    // did with it: nine Acts opened on a manuscript page, eight unpacked a foreign word
    // against "what you expect it to mean", and seven closed on a literal door sealing
    // shut — the metaphor in "close on a door that stays shut" rendered as bronze hinges,
    // every time. `arcBeats` could not fix that, because a sparse overlay of once-only
    // beats still leaves the cycle driving each Act's actual shape.
    actCycle: [],
    arcBeats: [],
    // The spine, in order. Derived beat by beat from three full transcripts of the
    // reference channel; every beat below appears in all three, in this sequence, and no
    // structural move is used twice. `assignBeatSheet` slices it across whatever Act count
    // the runtime tier asks for.
    beatSheet: [
      {
        id: "cold-open-artifact",
        instruction:
          "Open on ONE physical object, in ONE named building, with one tactile detail — what condition it is in, what it is kept in, how large it is. Then state, in the next breath, that what it contains contradicts what the viewer was taught. No greeting, no preamble, no statement of intent.",
        apparatus: true,
      },
      {
        id: "canon-removal",
        instruction:
          "The removal, then the reversal, in that order and without pausing between them: the council or authority that excluded the text and the year, how long it stayed that way, and then how many copies of it actually survive — compared BY NAME to specific books that stayed in the canon. The named comparison is the beat; the raw count alone is trivia.",
        apparatus: true,
      },
      {
        id: "promise-and-cta",
        instruction:
          "Make the promise as a list of three: 'In the next several minutes, you will see' — what the text says, the modern parallel, and why access is still restricted today. Then the channel's subscribe line, framed as something the viewer already is rather than a favour asked of them. Then move straight on: no thanks, no lingering.",
        signpost: "But here's what makes this stranger.",
      },
      {
        id: "sourcing-frame",
        instruction:
          "Where the text physically survives, briefly: the fragment and its catalogue number, the museum holding it, the approximate date, the language tradition that preserved it complete, and the standard scholarly edition. Four or five lines. This is the last apparatus-heavy beat until the suppression block.",
        apparatus: true,
      },
      {
        id: "impossible-knowledge",
        instruction:
          "The single fact the author should not have been able to know. State the modern established fact, state the year it was established, state when the text was written, and state the gap in years as a number. Do not soften it and do not explain it away.",
        signpost: "And this is where it gets disturbing.",
      },
      {
        id: "the-claim",
        instruction:
          "What the text actually says, in its own terms — the longest stretch of the video. Physical description, materials, dimensions, who is there and what they are doing. Quote the primary source verbatim at least twice, by chapter and verse. Do not talk about the manuscript here; talk about what is written in it.",
        weight: 3,
        signpost: "The text begins with this.",
      },
      {
        id: "escalation",
        instruction:
          "The second thing, and it must be worse than the first. Say so explicitly — name it as darker, stranger, or more dangerous than what came before — then deliver it. Compress anything that does not earn its runtime: a section that is merely interesting gets one sentence so the section that is alarming can have ten.",
        weight: 2,
        signpost: "But the text doesn't stop there. What follows is stranger still.",
      },
      {
        id: "killer-detail",
        instruction:
          "One small detail, and then STOP MOVING. Three to five lines turning it over: what it implies, what it rules out, what it would mean if it were meant literally. Reach a reading, state it plainly, and do not hedge it. This is the only beat in the video that is allowed to dwell, and a script that states a hundred things and lingers on none has failed here.",
        weight: 2,
        signpost: "This is worth slowing down on.",
      },
      {
        id: "philology",
        instruction:
          "One word in the original language, unpacked against the received translation — delivered as a clause in mid-flow, never as its own scene and never as an Act's opening move. Give the word, give what the standard English renders it as, give what it actually denotes, and move on within two lines.",
        apparatus: true,
        signpost: "What modern readers don't realize is this.",
      },
      {
        id: "translator-omission",
        instruction:
          "What the standard English translation left out or softened, and WHO made that decision. Name the translator, the year of the edition, the specific passage, and what the original says instead. Give the translator a motive or an admission — this is a person making a choice, not an error in a book.",
        apparatus: true,
        signpost: "And then comes the part the translators removed.",
      },
      {
        id: "modern-echo",
        instruction:
          "One documented contemporary finding that resembles what the text describes, with the researcher, the institution, the publication and the year. A second, later finding may follow it only if it escalates the first. Frame both as resemblance, never as confirmation, and never claim the ancient author possessed modern science.",
        signpost: "The part that shouldn't be possible is this.",
      },
      {
        id: "suppression-chronology",
        instruction:
          "The suppression, as a chronology in fixed order: the council and its year, then each later figure who argued against the text and what each one actually said, then the reversal — neither of them called it false, they called it inconvenient. Name no council or figure that an earlier Act already named.",
        weight: 2,
        apparatus: true,
      },
      {
        id: "preservation",
        instruction:
          "The tradition that kept the text anyway while the West set it aside — where, in what language, for how many centuries, and the fact that it is still being copied and read there now. One further layer of restriction most people miss may follow: a publication order, an embargo, a priority list that buried it.",
        apparatus: true,
        signpost: "There is one more layer to the suppression that most researchers miss.",
      },
      {
        id: "live-suppression",
        instruction:
          "Show the restriction is unresolved in the present tense: who applied, to which institution, in which year, how long the review took, the reason given, and the absence of any timeline. Report the facts adjacent to one another and draw no conclusion from them — the sequence is the argument.",
        apparatus: true,
        signpost: "Now, here's where it gets active.",
      },
      {
        id: "disclaimer",
        instruction:
          "Concede the maximalist reading once, in the first person — the only first-person moment in the video. Name the wildest version of the claim and disown it. Grant that the text crossed centuries of transmission and that what its author meant may exceed recovery. Then state what the text nevertheless says, and hit harder than before the concession.",
        signpost: "Now, let me be clear. I am not saying",
      },
      {
        id: "synthesis",
        instruction:
          "Lay the pieces side by side as a conditional chain — if this, and this, and this, then the conclusion is not what we were told. Draw the line the evidence supports and stop exactly there.",
        signpost: "What we have to confront is",
      },
      {
        id: "closer",
        instruction:
          "Close the video on two things, in this order: an inventory of where each piece of evidence physically sits right now — this manuscript in that building, that fragment under glass, that file redacted in that city. Then three or four short sentences that all begin with the word 'still': what is still there, still closed, still unexamined. End unresolved. Do not summarise and do not comfort.",
      },
    ],
    coldOpen: {
      maxSeconds: 45,
      // A promise with no payoff inside 30s is the largest retention drop in this format:
      // viewers leave during the setup, not during the content.
      payoffDeadlineSeconds: 30,
      // Six steps, in order, reproduced almost verbatim in all three reference episodes.
      // `bannedOpenings` below is the negative half and cannot produce this on its own.
      sequence: [
        "A single physical object, named building, tactile detail — what state it is in, what holds it, how big it is.",
        "In the next breath: what it contains does not match what the viewer was taught.",
        "The exclusion — the authority, the year — and how long it held.",
        "The reversal — the surviving copy count, compared by name to books that stayed in the canon.",
        "'In the next several minutes, you will see' — three specific things, the last being why access is still restricted.",
        "The subscribe line, then straight on. No thanks, no pause.",
      ],
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
    apparatusRule:
      "Apparatus means manuscripts, folios, parchment, catalogue and fragment numbers, editions, translators and scribal history. It belongs ONLY in the beats marked for it. Everywhere else, write about what the text SAYS, not about the document carrying it. Never open an Act on a manuscript, a parchment, a catalogue or a folio unless this Act's beats explicitly call for it. Across the whole video apparatus must stay under a fifth of the lines — if you find yourself describing a page rather than what is written on it, you are in the wrong beat.",
    sensoryRule:
      "Put physical sensation into the spoken narration, not only into the imagery. Materials, temperature, sound, weight, what a surface would feel like under a hand. The listener has their eyes elsewhere and the voice is the only channel they have, so a place described only as 'vast' or 'dark' has not been described. At least one line per Act must carry a sensation rather than a fact.",
    fragmentRule:
      "Break the rhythm on purpose. After a long sentence, land a short one. The short form this channel uses is antithesis — 'Not a metaphor, a sealed chamber.' 'They are not worshipping, they are working.' 'Not theology, astrophysics.' 'He did not say it was false, he said it was inconvenient.' Two or three per Act. Never write three consecutive lines of similar length; uniform line length is the single loudest tell that a script was not written by a person.",
    scaleRule:
      "Every figure must be converted into something a listener can picture, in the same breath it is given. Not 'thirty cubits' but 'thirty cubits — a cubit is about eighteen inches, so forty-five feet'. Not 'more manuscripts than the canon' but 'more copies than Deuteronomy, more than Exodus'. A number with no comparison beside it has not been delivered, only mentioned.",
    transitionPhrases: [
      "But the text doesn't stop there.",
      "What follows is stranger still.",
      "There is one more detail here that Western editions strip out entirely.",
      "This is not reinterpretation. This is not alternative reading.",
      "Here's what the translators left out.",
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
    contentAwareSlicing: false,
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
    coldOpen: { maxSeconds: 45, payoffDeadlineSeconds: 30, bannedOpenings: [], sequence: [] },
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
      // Only materialise an `openai` block when one side actually has one, so a preset
      // that never mentions OpenAI keeps `delivery.openai` undefined rather than `{}`.
      ...(preset.delivery.openai || override.delivery?.openai
        ? { openai: { ...preset.delivery.openai, ...override.delivery?.openai } }
        : {}),
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
/*                      Beat sheet — structure.beatSheet                      */
/* -------------------------------------------------------------------------- */

/** A beat with no declared weight counts as one share. */
function beatWeight(beat: Beat): number {
  // Guard the data, not just the type: a hand-edited blueprint can carry 0, a negative, or
  // NaN, any of which would corrupt the running total and silently misplace every later
  // beat rather than failing where the bad value is.
  const weight = Number(beat.weight ?? 1);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

/**
 * Cuts the beat sheet into one contiguous run per Act.
 *
 * Weighted rather than evenly counted, because unequal allocation is the point: the
 * reference format compresses three of the seven heavens into a single paragraph and then
 * spends four sentences on one detail about a door. `the-claim` at weight 3 therefore
 * occupies as much runtime as three ordinary beats, and lands alone in its Act.
 *
 * Runs are contiguous and ordered — beat 12 always follows beat 11, and never lands in an
 * earlier Act than it. That is the whole difference from `assignArcBeats`, which resolves
 * each beat's fractional position independently and so cannot express adjacency.
 *
 * At the shipped 17-beat forensic sheet this puts the cold open, the exclusion and the
 * promise in Act 1; the claim alone in Act 3; suppression in Act 7; and the disclaimer and
 * closer at the end — at 9 Acts and at 7, without retuning anything.
 *
 * Returns a Map keyed by Act number; Acts with no beats are absent rather than empty.
 */
export function assignBeatSheet(
  profile: FormatProfile,
  actCount: number
): Map<number, Beat[]> {
  const assignments = new Map<number, Beat[]>();
  const sheet = profile.structure.beatSheet;
  if (actCount < 1 || !sheet.length) return assignments;

  const totalWeight = sheet.reduce((sum, beat) => sum + beatWeight(beat), 0);

  let consumed = 0;
  for (const beat of sheet) {
    // Placed by the weight BEFORE it, not after: a heavy beat should start where its
    // predecessors ended rather than be pushed forward by its own size.
    const actNumber = Math.min(
      actCount,
      Math.floor((consumed / totalWeight) * actCount) + 1
    );
    consumed += beatWeight(beat);

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
