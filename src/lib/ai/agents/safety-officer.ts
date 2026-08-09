import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  MISSING_GEMINI_KEY_ERROR,
  STRUCTURED_TEMPERATURE,
  gemini,
  isGeminiConfigured,
} from "../gemini-provider";
import { SCENE_AGENT_CONCURRENCY, mapWithConcurrency } from "../concurrency";

/**
 * Agent 7 — The Safety Officer.
 *
 * Final pass before a prompt reaches Fal.ai / Kling. Rewrites content that would trip a
 * provider's NSFW or violence filter while preserving the cinematic intent — plan 07's
 * canonical example is "bloody knife" becoming "glistening steel in dim light".
 *
 * This protects generation throughput, not viewers: the downstream provider enforces
 * its own policy regardless. A scene rejected by that filter costs a retry and a
 * confusing failure in the editor, which is exactly what this pass avoids.
 */

const SafetyReviewSchema = z.object({
  safePrompt: z
    .string()
    .describe(
      "The prompt, rewritten only as much as needed to pass a commercial content filter. Preserve every visual detail that is already safe."
    ),
  wasModified: z
    .boolean()
    .describe("True only if the wording actually had to change."),
  reason: z
    .string()
    .describe(
      "If modified, a short note on what was softened. Empty string when unmodified."
    ),
});

export interface SafetyReview {
  safePrompt: string;
  wasModified: boolean;
  reason: string;
  /** Set when the safety pass itself failed and the raw prompt was passed through. */
  reviewFailed?: boolean;
}

const SAFETY_SYSTEM_INSTRUCTION = `You are the Safety Officer for an AI video generation pipeline.

You receive a cinematic image/video prompt and make the minimum edits required for it to pass a commercial generative-video content filter (NSFW, graphic violence, gore, hate imagery, real public figures in compromising contexts).

RULES:
1. Preserve the cinematic intent, mood and every already-safe visual detail. You are softening wording, not rewriting the shot.
2. Replace explicit gore with evocative equivalents. "Bloody knife" becomes "glistening steel in dim light". "Corpse" becomes "still figure".
3. Keep the prompt roughly the same length. Never add new subjects or change the setting.
4. Tension, danger, darkness and menace are all permitted — they are the point of these genres. Only remove what a filter would actually reject.
5. If the prompt is already safe, return it byte-for-byte unchanged and set wasModified to false.`;

export async function reviewPromptSafety(rawPrompt: string): Promise<SafetyReview> {
  if (!isGeminiConfigured()) {
    return {
      safePrompt: rawPrompt,
      wasModified: false,
      reason: MISSING_GEMINI_KEY_ERROR,
      reviewFailed: true,
    };
  }

  try {
    const { object } = await generateObject({
      model: gemini(AGENT_MODEL),
      schema: SafetyReviewSchema,
      temperature: STRUCTURED_TEMPERATURE,
      system: SAFETY_SYSTEM_INSTRUCTION,
      prompt: `Review this prompt:\n\n"${rawPrompt}"`,
    });

    return object;
  } catch (error) {
    // Passing the raw prompt through is the lesser failure: the provider's own filter
    // still stands behind us, so the worst case is a rejected generation rather than
    // unsafe output. Losing the scene entirely would be worse.
    console.error("[Safety Officer] Review failed, passing prompt through raw:", error);
    return {
      safePrompt: rawPrompt,
      wasModified: false,
      reason: (error as Error).message,
      reviewFailed: true,
    };
  }
}

export async function reviewPromptsSafety(
  rawPrompts: readonly string[]
): Promise<SafetyReview[]> {
  return mapWithConcurrency(rawPrompts, SCENE_AGENT_CONCURRENCY, (prompt) =>
    reviewPromptSafety(prompt)
  );
}
