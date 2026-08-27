import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  MISSING_GEMINI_KEY_ERROR,
  STRUCTURED_TEMPERATURE,
  gemini,
  isGeminiConfigured,
} from "../gemini-provider";
import { SCENE_TYPES } from "../generation-rules";
import { CHANNEL_BRIEF_BOXES, formatBriefBoxesForPrompt } from "../channel-brief";
import { FORMAT_PRESETS, mergeFormatProfile, type FormatProfile } from "../format-profile";

/**
 * The Format Analyst — turns a prose channel brief into a FormatProfile.
 *
 * This is the agent that closes the gap plan 18 left open. That plan set out to make "a
 * second channel in a different niche a data change, not a code fork", but shipped five
 * hardcoded presets and a diff — so a genuinely new channel still meant editing TypeScript.
 * Here the format itself becomes generated data.
 *
 * Unlike every other agent in this folder, this one runs at SETUP time rather than during
 * generation. It touches no project and no scene; it reads prose and returns a spec that the
 * user reviews before anything is saved.
 *
 * ## Translation, not invention
 *
 * The input is expected to be a brief someone has already thought through — research notes
 * on a channel in the niche, or the output of brainstorming with another model. That makes
 * the job structural extraction, which is reliable, rather than creative invention, which is
 * not. The system prompt below leans on that hard: it is told to quote the source's own
 * wording wherever it can, and to report a gap rather than fill one from imagination.
 *
 * ## Why gaps are returned instead of defaulted
 *
 * A silently defaulted field is worse than a missing one: the user cannot tell which parts
 * of the format are theirs and which the model guessed, and a wrong guess in `actCycle`
 * quietly reshapes every Act of every video. Returning them as questions makes the choice
 * visible, and the caller re-runs this same function with the answers appended — no second
 * agent, no merge logic.
 */

const BOX_IDS = CHANNEL_BRIEF_BOXES.map((box) => box.id) as [string, ...string[]];

/**
 * Deliberately narrower than `FormatProfile`.
 *
 * Omits `key` / `label` / `version` (system-managed) and the whole `delivery` block: the
 * channel runs one fixed local voice through Voice Studio, which exposes no pace or style
 * control, so there is nothing there a model could usefully decide. Delivery keeps the base
 * preset's values via `mergeFormatProfile` below.
 */
const FormatAnalysisSchema = z.object({
  identity: z.object({
    narratorPersona: z
      .string()
      .describe(
        "Who is narrating, as a ROLE not an adjective — e.g. 'an archivist working through recovered documents'. Include what they are NOT if the source says so; negative identity is unusually strong steering."
      ),
    explanatoryMethod: z
      .string()
      .describe(
        "The reasoning move this narrator repeats for EVERY claim, as an instruction. E.g. 'Explain by evidence chain: point at an object, say what it contains, name who removed it, then show what it resembles today.' This governs what gets said, not how it sounds — do not restate the register here."
      ),
    register: z
      .string()
      .describe(
        "How the narration sounds, plus the reading level if the source states one. Prefer the source's own words over synonyms."
      ),
    audienceStance: z
      .string()
      .describe(
        "The narrator's relationship to the VIEWER, distinct from register (how it sounds) and explanatoryMethod (how it reasons). Does the narrator confide in the viewer directly as 'you', frame the investigation as something 'we' are doing together, and assert a claim's truth head-on when a skeptical viewer would doubt it — or does it stay purely expository, narrating about the topic without ever addressing whoever is listening? A channel can get persona, reasoning and register all correct and still read as a report if this is thin — this is what separates 'someone informing you' from 'someone telling you the truth'. If the source shows direct address ('you', 'we', explicit assertions like \"this is not speculation\"), extract it in those terms; if the source is silent, infer a stance consistent with the niche and report it as a gap."
      ),
    forbiddenRegisters: z
      .array(z.string())
      .describe(
        "Three to five things the narration must NEVER sound like. Target the specific cliche this genre defaults to, not generic bad writing. If the source names only one, infer the rest from the genre it describes."
      ),
  }),
  structure: z.object({
    actCycle: z
      .array(z.string())
      .describe(
        "The beats EVERY chapter must hit, in order, as imperative instructions. Usually 3-5. This is the single most important field for long-form consistency. ONLY include a beat that genuinely bears repeating in every single chapter of a twenty-minute video — a beat that should happen once, at a particular point, belongs in arcBeats instead. Empty array ONLY if the source genuinely describes no repeating chapter shape."
      ),
    arcBeats: z
      .array(
        z.object({
          id: z
            .string()
            .describe(
              "Short kebab-case identifier, e.g. 'modern-echo' or 'suppression-chronology'. Never shown to a viewer."
            ),
          instruction: z
            .string()
            .describe(
              "The imperative instruction handed to whichever chapter carries this beat. Write it so it reads correctly in isolation, and say plainly that it happens only once."
            ),
          position: z
            .number()
            .min(0)
            .max(1)
            .describe(
              "Where in the runtime it belongs: 0 is the first chapter, 1 the last. A fraction, not a chapter number, because chapter count varies with video length."
            ),
        })
      )
      .describe(
        "Beats that happen exactly ONCE in a video, at a fixed point — as opposed to actCycle, which repeats every chapter. This distinction decides whether a twenty-minute video works. A beat like 'name who suppressed the text' or 'show the modern parallel' put in actCycle produces nine suppression beats and nine modern parallels in a nine-chapter video, and the format collapses into the same chapter told nine times. Typical members: the vindication or credibility reversal near the start (~0.05), a personal-stake beat (~0.2), the modern-parallel or corroboration beat (~0.7), the suppression or opposition chronology (~0.8), evidence the matter is still unresolved today (~0.88), and any once-only disclaimer or concession (~0.95). Empty array only if the source describes a format with genuinely no once-only beats."
      ),
    coldOpen: z.object({
      // `.min(0)`, not `.positive()`. The model needs a legal way to say "the source did
      // not state this" — given only a positive constraint it still answers 0 and the
      // ENTIRE generation fails schema validation, losing a perfectly good profile over
      // one unknown number. Zeros are stripped below so the base preset's value applies.
      maxSeconds: z
        .number()
        .int()
        .min(0)
        .describe(
          "How long the opening may run before the first real payoff. 30-60 is typical. Use 0 if the source does not state a duration, and report it as a gap."
        ),
      payoffDeadlineSeconds: z
        .number()
        .int()
        .min(0)
        .describe(
          "The mark by which the opening must deliver something concrete. Must be less than or equal to maxSeconds. Use 0 if the source does not state one, and report it as a gap."
        ),
      bannedOpenings: z
        .array(z.string())
        .describe(
          "Ways a video must never open — greetings, channel intros, statements of intent, logo stings. Infer sensible ones for the genre if the source is silent."
        ),
    }),
    terminalRevelation: z
      .boolean()
      .describe(
        "True if the largest reveal is deliberately held back for the final chapter rather than spent early."
      ),
    reHookIntervalSeconds: z
      .number()
      .int()
      .min(0)
      .describe(
        "Roughly how often a new open loop is started, in seconds. 0 disables the instruction entirely."
      ),
    closer: z
      .enum(["open-door", "summary", "cta"])
      .describe(
        "How every video ends. 'open-door' leaves the biggest question unanswered and points at what is next; 'summary' restates the single most important thing; 'cta' asks for the subscribe."
      ),
  }),
  content: z.object({
    lineComposition: z
      .enum(["camera-ready", "documentary"])
      .describe(
        "'documentary' lets lines name people, dates, institutions and sources with nothing visible on screen — required for any evidence-led or explanatory format. 'camera-ready' forces every line to state a visible subject, action and location, which suits action-driven narrative. When in doubt for a narration-led channel, choose 'documentary'."
      ),
    readingLevel: z
      .string()
      .describe(
        "Vocabulary and sentence complexity as an instruction the writer can follow. State a grade level ONLY if the source implies one — do not assume a default, and do not restate the register here. If the source is silent on reading level, describe only what it does imply about sentence complexity and report a gap."
      ),
    requiredBeats: z
      .array(z.string())
      .describe(
        "Things every video must contain without exception — a personal-stake beat by chapter 2, a verbatim citation per chapter. Distinct from actCycle: these are whole-video requirements, not the per-chapter shape."
      ),
    sourcingRule: z
      .string()
      .describe(
        "How facts, sources and claims are handled, and what may never be asserted. Empty string if the source says nothing about evidence handling."
      ),
    rotatingDevices: z
      .array(z.string())
      .describe(
        "Five to eight interchangeable variations of the ONE recurring claim this channel makes every episode — the specific antagonist, mechanism, or twist that differs video to video while the argument stays the same. E.g. for a suppressed-texts channel the varying element is WHO buried the text: 'a church council that declined to include it', 'a canon list that omits it', 'a translation that disagrees with the received wording'. These are NOT opening shots and NOT the chapter beats — those live in coldOpen and actCycle. Each entry must be substitutable for any other without changing the rest of the script."
      ),
  }),
  visual: z.object({
    visualBias: z
      .string()
      .describe(
        "Shot-selection guidance for the Scene Slicer — what kind of imagery to favour and how long to let it breathe."
      ),
    promptStyleTag: z
      .string()
      .describe(
        "Short comma-separated keywords safe to append to an image-generation prompt, e.g. 'archival documentary photography, desaturated palette, aged paper texture'. Concrete visual descriptors only — never prose, never abstract mood words a diffusion model would render literally."
      ),
    preferredSceneTypes: z
      .array(z.enum(SCENE_TYPES))
      .describe("The cinematic shot roles this channel favours. Two to four of them."),
    stillTreatment: z
      .string()
      .describe(
        "How still images are treated: colour, movement, seconds per image — drawn from what THIS source says about its own imagery. Empty string if the source describes no still-image style; an empty string plus a reported gap is correct here, an invented treatment is not."
      ),
  }),
  gaps: z
    .array(
      z.object({
        boxId: z
          .enum(BOX_IDS)
          .describe("Which of the six brief questions the source text did not answer."),
        followUp: z
          .string()
          .describe(
            "A direct question asking the user for the VALUE you had to guess, phrased so a short typed answer fills it in. Ask 'How long may the cold open run before its first payoff?' — never 'does the source specify a cold open duration?'. It must never describe what the source did or did not say — ask for the value, not for whether the value was mentioned. For a true/false field a direct yes/no question is correct ('Is the largest reveal held back for the final chapter?'); for every other field the question must not be answerable yes/no and must not open with Does/Are/Should/Can. State the units or the options you need where that helps: seconds, a grade level, one of open-door/summary/cta."
          ),
      })
    )
    .describe(
      "Questions the source text left unanswered, where you had to infer rather than extract. Report a gap for anything you invented — do not report one for a field you genuinely derived from the text. An empty array means the brief covered everything."
    ),
});

export interface FormatAnalysisGap {
  boxId: string;
  followUp: string;
}

export interface AnalyzeChannelBriefResult {
  success: boolean;
  profile?: FormatProfile;
  gaps?: FormatAnalysisGap[];
  error?: string;
}

export async function analyzeChannelBrief(
  source: string
): Promise<AnalyzeChannelBriefResult> {
  if (!isGeminiConfigured()) {
    return { success: false, error: MISSING_GEMINI_KEY_ERROR };
  }

  const trimmed = source.trim();
  if (trimmed.length < 80) {
    return {
      success: false,
      error:
        "That is too short to build a format from. Paste your research, notes, or a brainstorm — a few paragraphs is enough.",
    };
  }

  try {
    console.log(`[Format Analyst] Analysing a ${trimmed.length}-character channel brief.`);

    const { object } = await generateObject({
      model: gemini(AGENT_MODEL),
      schema: FormatAnalysisSchema,
      temperature: STRUCTURED_TEMPERATURE,
      system: `You are the Format Analyst. You read a description of a video channel and compile it into a precise, machine-followable format specification.

The text you are given is usually one of two things: research notes about an existing channel, or the output of someone brainstorming a channel they intend to build. Either way, treat it as a specification to TRANSLATE, not a prompt to be creative with.

RULES:
1. Extract, do not invent. Where the source states something, use its own wording rather than a synonym — the user recognises their own phrasing on the review screen, and a paraphrase silently changes meaning.
2. Write every field as an INSTRUCTION a writer could follow, not as a description of the channel. "Open on a physical artifact you can point at" is usable. "The channel has a strong visual opening" is not.
3. Be concrete and specific. Reject your own output if it contains words like engaging, compelling, cinematic or mysterious with nothing behind them.
4. Where you had to infer a field rather than extract it, report it in 'gaps'. Be honest here — an unreported guess is worse than a reported one, because the user cannot tell which parts of the format are actually theirs.
5. Never report a gap for a field you genuinely derived from the text. If the source states something in ANY usable form, that is not a gap — do not ask for a more precise version of an answer you already have. "College-level" is a reading level; "each shot holds 4 to 6 seconds" is a still treatment. Only report a field the source is genuinely silent on.
6. The worked examples below show the SHAPE, specificity and length expected of an answer. They describe a different channel. Never copy their wording or their content into your output — if the source is silent on something, infer it from the source's OWN subject matter and vocabulary, and report the gap. Reusing an example verbatim is the single worst failure mode here, because the user cannot tell it apart from something they actually said.

The user was asked to cover these six areas. Use them to decide what to extract and what is missing:

${formatBriefBoxesForPrompt()}`,
      prompt: `Compile the following channel description into a format specification.

"""
${trimmed}
"""`,
    });

    // The analyst fills identity/structure/content/visual; key, label, version and the whole
    // delivery block come from the custom base. Merging rather than spreading by hand means
    // a field added to FormatProfile later is inherited automatically instead of arriving
    // undefined at a prompt builder.
    // A 0 means "the source never said" (see the coldOpen schema above). Dropping the key
    // entirely rather than passing the 0 through is what lets mergeFormatProfile fall back
    // to the base preset — a literal 0 would mean "the cold open may run for no time at
    // all", which would silently break every script this format ever produces.
    const { maxSeconds, payoffDeadlineSeconds, bannedOpenings } = object.structure.coldOpen;
    const coldOpen: Record<string, unknown> = { bannedOpenings };
    if (maxSeconds > 0) coldOpen.maxSeconds = maxSeconds;
    // Only honoured alongside a real maxSeconds, and never past it: a deadline later than
    // the opening it belongs to instructs the writer to pay off after the scene has ended.
    if (payoffDeadlineSeconds > 0 && maxSeconds > 0) {
      coldOpen.payoffDeadlineSeconds = Math.min(payoffDeadlineSeconds, maxSeconds);
    }

    const profile = mergeFormatProfile(FORMAT_PRESETS.custom, {
      identity: object.identity,
      structure: { ...object.structure, coldOpen },
      content: object.content,
      visual: object.visual,
      sourceBrief: trimmed,
    });

    console.log(
      `[Format Analyst] Built "${profile.identity.narratorPersona.slice(0, 60)}…" with ${
        profile.structure.actCycle.length
      } act beats and ${object.gaps.length} gap(s).`
    );

    return { success: true, profile, gaps: object.gaps };
  } catch (error) {
    console.error("[Format Analyst] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyse the channel brief.",
    };
  }
}
