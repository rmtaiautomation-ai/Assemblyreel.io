"use server";

import { generateObject } from "ai";
import { z } from "zod";
import {
  MISSING_OPENAI_KEY_ERROR,
  OBJECT_PROVIDER_OPTIONS,
  SCRIPT_MODEL,
  isOpenAIConfigured,
  openai,
} from "./openai-provider";
import { resolveDurationProfile } from "./generation-rules";
import { resolveFormatProfile, type FormatProfile } from "./format-profile";
import type { ActContinuityEntry, ChannelFact } from "./channel-facts";
import {
  buildActStructureRules,
  buildScriptWriterSystemInstruction,
} from "./format-prompt";
// These functions go through the Vercel AI SDK like every other agent, and draw on
// the same provider quota — so they share the same throttle.
import { acquireCallSlot } from "./concurrency";

export async function generateScript(params: {
  topic: string;
  narrativeArc: string;
  hook: string;
  visualAesthetic: string;
  pov: string;
  nicheTheme?: string;
  targetDuration?: string;
  actOutline?: { actNumber: number; description: string };
  /**
   * The channel's resolved format spec.
   *
   * Optional so every existing caller keeps working: when it is absent the profile is
   * derived from `nicheTheme` exactly as the old Niche/Tone Matrix was, producing the same
   * prompt as before. Phase 4 passes the project's frozen snapshot here instead, so an Act
   * generated after a blueprint edit still follows the rules the earlier Acts were written
   * under.
   */
  formatProfile?: FormatProfile;
  /** Deterministic pick from the rotation ledger. See buildScriptWriterSystemInstruction. */
  selectedFramingDevice?: string | null;
  /**
   * The channel's VERIFIED fact ledger, frozen onto the project.
   *
   * The closed set of people, councils, manuscripts and dates this script may name. Absent
   * or empty — a channel with no ledger, or a database that has not run
   * db/add-channel-facts.sql — and the compiled instruction is unchanged from before the
   * ledger existed, so every existing caller keeps working untouched.
   */
  facts?: readonly ChannelFact[];
  /**
   * What earlier Acts of this video already covered — see `continuityBlock`.
   *
   * Optional and additive: absent, the compiled instruction is exactly what it was before
   * the ledger existed, so short/mid-form and any caller that hasn't wired it through keep
   * working untouched.
   */
  continuity?: readonly ActContinuityEntry[];
}) {
  if (!isOpenAIConfigured()) {
    return { success: false, error: MISSING_OPENAI_KEY_ERROR };
  }

  try {
    const profile =
      params.formatProfile ?? resolveFormatProfile({ nicheTheme: params.nicheTheme });
    const duration = resolveDurationProfile(params.targetDuration);

    // An Act request narrows the target to a single chapter, so the whole-video word
    // count does not apply — but a per-Act word budget very much does. Sending only a
    // line count (which is what this did) let the model satisfy the instruction with
    // ~12-word lines, so every long-form tier came in 35-40% under its runtime target
    // no matter which duration the user picked. `wordsPerAct` is pre-divided by
    // actCount in generation-rules.ts.
    const lengthRule = params.actOutline
      ? `Exactly ${duration.targetLineCount.min} to ${duration.targetLineCount.max} lines strictly for this single Act, totalling ${duration.wordsPerAct.min}-${duration.wordsPerAct.max} words. This word count is the hard target — if you are short, write RICHER, more detailed lines rather than more lines.`
      : `Exactly ${duration.targetLineCount.min} to ${duration.targetLineCount.max} lines (total ${duration.targetWordCount.min}-${duration.targetWordCount.max} words). Structure: ${duration.structureRule}`;

    const systemInstruction = buildScriptWriterSystemInstruction(profile, {
      lengthRule,
      selectedFramingDevice: params.selectedFramingDevice,
      facts: params.facts,
      continuity: params.continuity,
      // Only on the Act path: a single-pass script has no arc to distribute beats across,
      // and passing actCount without an Act number would place every beat in no Act at all.
      // `duration.actCount` rather than a new parameter, so the placement always matches the
      // Act count the outliner was given for the same project.
      ...(params.actOutline
        ? { actNumber: params.actOutline.actNumber, actCount: duration.actCount }
        : {}),
    });

    // Blank for every Act after the first — see the caller in whiteboard-actions.ts
    // for why. Omitting the line entirely rather than printing "Hook: " with nothing
    // after it, matching the rest of this codebase's convention of never emitting a
    // labelled section with no content behind it (format-prompt.ts's `block` helper
    // does the same).
    let prompt = `
Write a Voiceover Script based on this Topic and Story Outline.

Topic: ${params.topic}
Story Outline: ${params.narrativeArc}${params.hook ? `
Hook: ${params.hook}` : ""}
Visual Aesthetic: ${params.visualAesthetic}
POV: ${params.pov}
`;

    if (params.actOutline) {
      prompt += `
IMPORTANT: You are only writing the script for ACT ${params.actOutline.actNumber}.
Act Goal: ${params.actOutline.description}
Do NOT write the entire story. Only cover this specific act!
`;
    }

    prompt += `\nGenerate the script adhering strictly to the rules. Return a JSON array where each element is a line of the script.`;

    await acquireCallSlot();

    const { object } = await generateObject({
      model: openai(SCRIPT_MODEL),
      providerOptions: OBJECT_PROVIDER_OPTIONS,
      schema: z.object({
        lines: z
          .array(z.string())
          .describe("The script, one spoken line per array element, in order."),
      }),
      temperature: 0.7,
      system: systemInstruction,
      prompt,
    });

    let scriptLines = object.lines;

    // Clean the script lines to remove AI artifacts (asterisks, double commas, slashes, quotes)
    scriptLines = scriptLines.map(line => {
      return line
        .replace(/[*_]/g, "") // Remove markdown asterisks and underscores
        .replace(/[\\/]/g, "") // Remove BOTH forward slashes and backslashes
        .replace(/["']/g, "") // Remove all quotes (single and double)
        .replace(/,,+/g, ",") // Replace double/triple commas with a single comma
        .replace(/\s+/g, " ") // Normalize multiple spaces into one
        .trim();
    });

    return { success: true, scriptLines };
  } catch (error) {
    console.error("Error generating script:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function generateArcAndHook(topic: string, nicheTheme: string) {
  if (!isOpenAIConfigured()) return { success: false, error: MISSING_OPENAI_KEY_ERROR };

  try {
    const prompt = `
Based on the niche "${nicheTheme}" and the core topic "${topic}", generate a short Story Outline and a catchy 5-second Script Hook.

The Story Outline should be a 2-3 sentence summary of the plot.
The Script Hook should be 1-2 sentences designed to grab the viewer's attention immediately within the first 3-5 seconds.
`;

    await acquireCallSlot();

    const { object: data } = await generateObject({
      model: openai(SCRIPT_MODEL),
      providerOptions: OBJECT_PROVIDER_OPTIONS,
      schema: z.object({
        narrativeArc: z.string().describe("The 2-3 sentence story outline."),
        scriptHook: z.string().describe("The catchy 1-2 sentence hook."),
      }),
      temperature: 0.7,
      prompt,
    });

    return { success: true, data };
  } catch (error) {
    console.error("Error generating Arc/Hook:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function generateActOutlines(
  topic: string,
  narrativeArc: string,
  nicheTheme: string,
  targetDuration: string,
  /** Optional; falls back to keyword resolution from `nicheTheme`. See generateScript. */
  formatProfile?: FormatProfile
) {
  if (!isOpenAIConfigured()) return { success: false, error: MISSING_OPENAI_KEY_ERROR };

  const { actCount } = resolveDurationProfile(targetDuration);
  const profile = formatProfile ?? resolveFormatProfile({ nicheTheme });

  try {
    const prompt = `
The user is creating a long-form YouTube video about "${topic}".
Niche/Genre: "${nicheTheme}"
The core narrative arc is: "${narrativeArc}"

Based on the psychology of high-retention YouTube videos for the "${nicheTheme}" niche, break this story down into exactly ${actCount} distinct Acts (Chapters).

Apply psychological pacing and value stacking tailored to this specific niche (e.g., True Crime relies on suspense/red herrings, History relies on contextual hooks/escalation, Motivation relies on emotional peaks).

Structure Rules for a ${actCount}-Act Video:
${buildActStructureRules(profile, actCount)}

Return a JSON array of exactly ${actCount} objects. Each object should have:
- "actNumber" (integer, 1 to ${actCount})
- "title" (string)
- "description" (a 2-3 sentence summary of what must happen in this specific act to maintain high retention).
`;
    
    await acquireCallSlot();

    const { object } = await generateObject({
      model: openai(SCRIPT_MODEL),
      providerOptions: OBJECT_PROVIDER_OPTIONS,
      schema: z.object({
        acts: z
          .array(
            z.object({
              actNumber: z.number().int().describe(`Act order, 1 to ${actCount}.`),
              title: z.string(),
              description: z
                .string()
                .describe(
                  "A 2-3 sentence summary of what must happen in this act to maintain high retention."
                ),
            })
          )
          .describe(`Exactly ${actCount} acts, in order.`),
      }),
      temperature: 0.7,
      prompt,
    });

    return { success: true, acts: object.acts };
  } catch (error) {
    console.error("Error generating acts:", error);
    return { success: false, error: (error as Error).message };
  }
}
