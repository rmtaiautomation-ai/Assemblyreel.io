import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  CREATIVE_TEMPERATURE,
  MISSING_GEMINI_KEY_ERROR,
  gemini,
  isGeminiConfigured,
} from "../gemini-provider";
import type { FormatProfile } from "../format-profile";
import { compileThumbnailDirection } from "../format-prompt";
import { acquireCallSlot } from "../concurrency";

/**
 * The Thumbnail Composer.
 *
 * Designs the overlay (headline, graphic accent, color) for a thumbnail — it never
 * touches image bytes itself. The reference image (a concept-pass key art still or a
 * final-pass extracted video frame) is generated/extracted by the caller and passed to
 * `geminiImageProvider` alongside this agent's `compositePrompt`, the same way
 * `assembleVideoPrompt` hands a scene prompt to a video provider. One code path serves
 * both passes; only how the reference image was produced differs upstream.
 */

const ThumbnailConceptSchema = z.object({
  headlineText: z
    .string()
    .describe("3-6 words, bold YouTube-style hook text for the overlay."),
  subjectFraming: z
    .string()
    .describe("How the subject in the reference image should be cropped or emphasized."),
  graphicElement: z
    .string()
    .describe(
      "A single graphic accent, e.g. 'red circle around the object' or 'arrow pointing at the reaction' — or 'none'."
    ),
  colorAccent: z
    .string()
    .describe("Dominant accent color for the text/graphic overlay, matched to the channel's visual style."),
  compositePrompt: z
    .string()
    .describe(
      "A single concrete instruction for an image model that already has the reference image in hand: keep the reference image's subject and setting, and add only the headline text and graphic accent described above."
    ),
});

export type ThumbnailConcept = z.infer<typeof ThumbnailConceptSchema>;

export interface ThumbnailConceptInput {
  topic: string;
  formatProfile: FormatProfile;
  /**
   * A prose description of the reference image the overlay will be composited onto —
   * the chosen scene's `final_video_prompt` for the concept pass, a caption of the
   * extracted frame for the final pass.
   */
  sourceDescription: string;
}

export interface ComposeThumbnailResult {
  concept: ThumbnailConcept | null;
  error?: string;
}

export async function composeThumbnailConcept({
  topic,
  formatProfile,
  sourceDescription,
}: ThumbnailConceptInput): Promise<ComposeThumbnailResult> {
  if (!isGeminiConfigured()) {
    return { concept: null, error: MISSING_GEMINI_KEY_ERROR };
  }

  const systemInstruction = `You are the Thumbnail Composer for a YouTube channel's video pipeline.

You will be shown a reference image (the subject/scene the thumbnail is built from) and asked to design ONE overlay for it: a short bold headline, an optional graphic accent (a circle, arrow, or similar), and a color treatment — the classic high-CTR YouTube look of a strong subject plus bold text plus one graphic accent.

RULES:
1. The headline is 3-6 words, punchy, and creates curiosity without misrepresenting the actual video.
2. Never invent a subject that is not in the reference image — you are compositing on top of it, not redrawing the scene.
3. The composite prompt must instruct the image model to preserve the reference image's subject and setting, adding only the text and graphic overlay you describe.
${compileThumbnailDirection(formatProfile)}`;

  try {
    await acquireCallSlot();
    const { object } = await generateObject({
      model: gemini(AGENT_MODEL),
      schema: ThumbnailConceptSchema,
      temperature: CREATIVE_TEMPERATURE,
      system: systemInstruction,
      prompt: `Topic: ${topic}

Reference image shows: ${sourceDescription}

Design the thumbnail overlay for this reference image.`,
    });

    return { concept: object };
  } catch (error) {
    console.error("[Thumbnail Composer] Failed:", error);
    return { concept: null, error: (error as Error).message };
  }
}
