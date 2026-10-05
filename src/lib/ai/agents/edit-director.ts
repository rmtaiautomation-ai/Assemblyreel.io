import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  CREATIVE_TEMPERATURE,
  MISSING_OPENAI_KEY_ERROR,
  OBJECT_PROVIDER_OPTIONS,
  isOpenAIConfigured,
  openai,
} from "../openai-provider";
import { SCENE_AGENT_CONCURRENCY, mapWithConcurrency } from "../concurrency";
import { resolveFormatProfile, type FormatProfile } from "../format-profile";

const ComboIdSchema = z.enum([
  "title_reveal",
  "motion_text",
  "checklist",
  "quote",
  "chapter_open",
  "divine",
  "archive",
  "clean",
]);

export type ComboId = z.infer<typeof ComboIdSchema>;

const SceneDirectorSchema = z.object({
  comboId: ComboIdSchema.describe("The chosen visual combo for this scene."),
  stockSearchQueries: z.array(z.string()).length(3).describe(
    "3 progressively broader stock search queries for the background media. E.g. 1. 'ancient ethiopian manuscript' 2. 'old manuscript pages' 3. 'old book'"
  ),
  overlayText: z.string().optional().describe(
    "The text to display on screen. Required if the combo includes text/cards."
  ),
  anchorPhrase: z.string().optional().describe(
    "A 2-4 word exact quote from the scene's script where the overlay should first appear."
  ),
});

export type SceneDirectorDecision = z.infer<typeof SceneDirectorSchema>;

export interface EditDirectorInput {
  sceneId: string;
  sceneText: string;
}

export interface EditDirectorParams {
  scenes: readonly EditDirectorInput[];
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
  formatProfile?: FormatProfile;
}

export interface EditDirectorResult {
  decision: SceneDirectorDecision | null;
  error?: string;
}

export async function directSceneEdits({
  scenes,
  topic,
  visualAesthetic,
  nicheTheme,
  formatProfile,
}: EditDirectorParams): Promise<EditDirectorResult[]> {
  if (!isOpenAIConfigured()) {
    return scenes.map(() => ({ decision: null, error: MISSING_OPENAI_KEY_ERROR }));
  }

  const profile = formatProfile ?? resolveFormatProfile({ nicheTheme });

  const systemInstruction = `You are the Edit Director for a video pipeline.

Your job is to select the visual presentation for each scene by picking one of 8 predefined Combos and writing the stock search queries.

THE 8 COMBOS:
1. title_reveal: For key facts and dates.
2. motion_text: Short, punchy statements.
3. checklist: Lists, steps, or multiple reasons.
4. quote: Quoting a text or person.
5. chapter_open: For the start of an act or major topic shift.
6. divine: Gods, angels, the sacred, or overwhelming scale.
7. archive: Historical context, places, names.
8. clean: Just the background media with slow motion (Ken Burns). No text or cards.

RULES:
1. You MUST use the "clean" combo for roughly 40% of scenes to avoid visual clutter. Give the video breathing room.
2. Never use the same combo twice in a row, except for "clean".
3. Write exactly 3 progressively broader stock search queries per scene. The 1st is specific, the 3rd is very broad.
4. If a combo requires text (all except 'clean' and 'divine' can optionally omit text, but usually need it), provide the \`overlayText\` and an \`anchorPhrase\` from the scene's script so we know when to show it.
5. Visual Aesthetic: ${visualAesthetic}
6. Niche Styling: ${profile.visual.visualBias}`;

  return mapWithConcurrency(scenes, SCENE_AGENT_CONCURRENCY, async (scene, index) => {
    try {
      const { object } = await generateObject({
        model: openai(AGENT_MODEL),
        temperature: CREATIVE_TEMPERATURE,
        schema: SceneDirectorSchema,
        system: systemInstruction,
        prompt: `Direct the following scene:
Scene Text: "${scene.sceneText}"`,
        ...OBJECT_PROVIDER_OPTIONS,
      });

      return { decision: object };
    } catch (error: any) {
      console.warn(`[Edit Director] Failed for scene: ${error.message}`);
      return { decision: null, error: error.message };
    }
  });
}
