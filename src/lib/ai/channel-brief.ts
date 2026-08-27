/**
 * The seven questions a channel's format is derived from, and the prompt that helps a user
 * answer them.
 *
 * ## Why seven and not twenty-five
 *
 * `FormatProfile` has around twenty-five fields because each one is an instruction for a
 * different agent — the Script Writer, the Act Outliner, the Scene Slicer, the Prompt
 * Assembler. That is right for the pipeline and wrong for a person: filling twenty-five
 * boxes from scratch is research work, not settings work, and a blank form gives no signal
 * about which fields actually carry the channel's identity.
 *
 * These seven do. Everything else is either derivable from them or a refinement, so the
 * user answers seven and `format-analyst.ts` infers the rest. They are ordered by leverage,
 * not by how the type happens to be grouped:
 *
 *  - Negative constraints (box 5) outrank positive adjectives, because a model's default IS
 *    the genre stereotype. "Never sound like a sermon" moves output further than any amount
 *    of describing what it should sound like instead.
 *  - The chapter template (box 6) is what holds a twenty-minute video together, since each
 *    Act is a separate generation call that never sees the others.
 *  - "How they reason" (box 2) and "how they relate to you" (box 3) are the two with no
 *    home in the pre-existing type at all; see `FormatIdentity.explanatoryMethod` and
 *    `FormatIdentity.audienceStance`.
 *  - Box 3 was added after the first six were already shipping, discovered by LISTENING to
 *    generated audio rather than by reading a transcript: a script can get persona,
 *    reasoning and register all correct on paper and still read as a report out loud,
 *    because every sentence was about the topic and none of them were aimed at whoever is
 *    listening. Reading a script for tone catches register problems; it does not catch an
 *    absent relationship to the audience, because the sentences are individually fine.
 *
 * ## Single source of truth
 *
 * This module is imported by BOTH the settings UI (which renders the boxes as a guide) and
 * the analyst agent (whose system prompt enumerates them). One list means the question a
 * user is answering and the question the model is extracting can never drift apart. Pure
 * data, no `"use server"` — a client component has to be able to render it, the same
 * constraint that keeps `format-prompt.ts` separate from `script-writer.ts`.
 */

export interface ChannelBriefBox {
  id: string;
  /** Short label for the settings-page guide. */
  label: string;
  /** The question, phrased the way it would be asked out loud. */
  question: string;
  /** Why this one matters — shown as help text, and given to the model as rationale. */
  why: string;
  /** A worked answer. Demonstration steers both the user and the model harder than description. */
  example: string;
  /** Which FormatProfile fields the analyst should derive from this box. */
  fills: readonly string[];
}

export const CHANNEL_BRIEF_BOXES: readonly ChannelBriefBox[] = [
  {
    id: "who",
    label: "Who is talking",
    question: "Who is narrating? Describe them as a role, not an adjective.",
    why: "A role carries a whole set of behaviours with it. An adjective carries none — 'mysterious' tells a model nothing it can act on; 'an archivist working through recovered documents' tells it everything.",
    example:
      "An archivist working through recovered documents, showing the viewer what the record actually says. Not a preacher, not a prophet, not a conspiracy host. Treats the viewer as a fellow researcher, never as a congregation.",
    fills: ["identity.narratorPersona"],
  },
  {
    id: "reason",
    label: "How they reason",
    question:
      "How does this narrator explain things? What move do they repeat for every claim?",
    why: "This decides what actually gets said, not just how it sounds. A psychology channel is not one that uses psychology words — it is one where every event is explained by naming the mechanism underneath it. Two narrators with the same voice produce completely different scripts if they reason differently.",
    example:
      "Explain by evidence chain. Point at a physical object, say what it contains, name who removed or restricted it and when, then show what it resembles today — framed as resemblance, never as proof.",
    fills: ["identity.explanatoryMethod"],
  },
  {
    id: "audience",
    label: "How they relate to you",
    question:
      "Does the narrator confide in the viewer directly, or only narrate about the topic?",
    why: "A model defaults to expository third person unless told otherwise, and that alone is what makes a script sound like a report. Direct address ('you'), shared investigation ('we'), and stating a claim's truth plainly when a skeptical viewer would doubt it are what make a script sound like someone telling you something real, rather than someone informing you of something interesting.",
    example:
      "This is an investigation the narrator and the viewer are running together, not a lecture. Speak to the viewer directly as \"you\" throughout, and frame the shared work as \"we\" — what we have to confront, what we are being shown. When a claim would make a skeptical viewer doubt it, meet that doubt head-on: state the claim's truth plainly rather than only presenting evidence and moving on.",
    fills: ["identity.audienceStance"],
  },
  {
    id: "talk",
    label: "How they talk",
    question: "What is the register, and at what reading level?",
    why: "Reading level is a real instruction a model follows well. 'Ninth grade, short sentences, define any technical term in the same breath' is far more actionable than 'accessible'.",
    example:
      "Serious and urgent, but grounded. State extraordinary claims plainly — the weight comes from the evidence, not from adjectives. Ninth-grade reading level, short sentences, one idea each.",
    fills: ["identity.register", "content.readingLevel"],
  },
  {
    id: "never",
    label: "Never do this",
    question: "What must the narration never sound like? Name three to five things.",
    why: "The highest-leverage box on this page. A model writing in your genre reaches for that genre's cliche by default — sermon voice for biblical content, self-help voice for psychology. Naming them is what stops it.",
    example:
      "Sermonising or altar-call language. Sunday-school gentleness. Hype and clickbait phrasing. Ranting, or naming a present-day conspiracy. Asserting a scientific finding that does not exist.",
    fills: ["identity.forbiddenRegisters"],
  },
  {
    id: "chapter",
    label: "What every chapter does",
    question: "What beats does every chapter hit, in the same order, every single time?",
    why: "This is what holds a twenty-minute video together. Each Act is written by a separate generation call, so without a fixed template every chapter improvises its own shape and the video stops feeling like one piece.",
    example:
      "1. Open on a physical artifact you can point at. 2. State plainly what it contains. 3. Name who removed or restricted it, and when. 4. Show the modern echo, as resemblance not proof. 5. Close on a door that stays shut, and name the question the next chapter answers.",
    fills: [
      "structure.actCycle",
      "structure.coldOpen",
      "structure.closer",
      "content.requiredBeats",
    ],
  },
  {
    id: "see",
    label: "What we see",
    question: "What is on screen while the narrator talks, and how is it treated?",
    why: "The Scene Slicer and the image-prompt assembler read this. Subject alone is not enough — colour, movement and how long a shot holds are what make forty videos look like one channel.",
    example:
      "Manuscript surfaces, fragments, maps and carved stone held still — the object itself, not a recreation of the event. Desaturated, low warm key light, aged paper texture. Five to eight seconds per image, slow push, no fast cuts.",
    fills: [
      "visual.visualBias",
      "visual.promptStyleTag",
      "visual.preferredSceneTypes",
      "visual.stillTreatment",
    ],
  },
] as const;

/**
 * A prompt the user can run against any other LLM to turn a rough idea — or research notes
 * on an existing channel — into text that covers all six boxes.
 *
 * Deliberately asks for prose rather than a filled-in form: the analyst extracts structure
 * from paragraphs perfectly well, and asking a chat model for JSON invites it to invent
 * field names that mean nothing here. The closing paragraph matters most — vague source text
 * is the single most common reason a generated format comes back weak.
 */
export const CHANNEL_BRIEF_LLM_PROMPT = [
  "I'm defining the format for a faceless long-form video channel.",
  "Ask me whatever you need, then give me final answers to these seven",
  "questions as clear prose paragraphs:",
  "",
  "1. Who is the narrator? Describe them as a role or job, not an",
  "   adjective. Include what they are NOT.",
  "2. How does this narrator explain things? What reasoning move do they",
  "   repeat for every single claim?",
  "3. Does the narrator confide in the viewer directly - speaking as",
  "   \"you\", framing the investigation as something \"we\" are doing -",
  "   or only narrate about the topic? Does it state a claim's truth",
  "   plainly when a skeptical viewer would doubt it, rather than only",
  "   presenting evidence and moving on?",
  "4. What is their register, and at what reading level do they speak?",
  "5. What must the narration NEVER sound like? Name three to five things.",
  "6. What beats does every chapter hit, in the same order, every time?",
  "7. What is on screen while they talk, and how is it treated - colour,",
  "   movement, how long each shot holds?",
  "",
  "Be concrete. Vague answers like \"engaging\", \"cinematic\" or",
  "\"mysterious\" are useless to me. I need instructions specific enough",
  "that a machine could follow them and get the same result twice.",
].join("\n");

/** Renders the six boxes for the analyst's system prompt. */
export function formatBriefBoxesForPrompt(): string {
  return CHANNEL_BRIEF_BOXES.map(
    (box, i) =>
      `${i + 1}. [${box.id}] ${box.question}\n   Why it matters: ${box.why}\n   A good answer looks like: "${box.example}"`
  ).join("\n\n");
}
