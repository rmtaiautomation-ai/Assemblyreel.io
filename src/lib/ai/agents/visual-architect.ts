import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  CREATIVE_TEMPERATURE,
  MISSING_GEMINI_KEY_ERROR,
  gemini,
  isGeminiConfigured,
} from "../gemini-provider";
import { SCENE_AGENT_CONCURRENCY, mapWithConcurrency } from "../concurrency";
import { resolveNicheProfile, type SceneType } from "../generation-rules";
import { selectBlueprintsForScene, type CharacterBlueprints } from "./casting-director";

/**
 * Agents 4 & 5 — The Visual Architect and The Cinematic Director.
 *
 * Plan 03 groups these two under a single heading and a single parallel pass, and they
 * are implemented as one call per scene here for a substantive reason: the camera
 * decision depends on the environment being established in the same breath. Splitting
 * them would double the API calls and force the Cinematic Director to re-read an
 * environment it did not author.
 */

const SceneVisualsSchema = z.object({
  environment: z
    .string()
    .describe(
      "The physical setting: location, time of day, weather, terrain, architecture, foreground and background elements. Visual nouns only."
    ),
  lighting: z
    .string()
    .describe(
      "Light quality and direction — e.g. 'harsh midday sun casting hard shadows', 'single candle, deep chiaroscuro falloff'."
    ),
  cameraDirection: z
    .string()
    .describe(
      "One concrete camera instruction combining lens, height and movement — e.g. 'low-angle drone sweep rising over the ridge', 'handheld 35mm push-in on the subject's hands'."
    ),
});

export type SceneVisuals = z.infer<typeof SceneVisualsSchema>;

export interface SceneVisualsInput {
  sceneText: string;
  sceneType: SceneType;
}

export interface DesignSceneVisualsParams {
  scenes: readonly SceneVisualsInput[];
  blueprints: CharacterBlueprints;
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
}

/** A scene that failed its visual pass still flows on, carrying the reason. */
export interface SceneVisualsResult {
  visuals: SceneVisuals | null;
  error?: string;
}

export async function designSceneVisuals({
  scenes,
  blueprints,
  topic,
  visualAesthetic,
  nicheTheme,
}: DesignSceneVisualsParams): Promise<SceneVisualsResult[]> {
  if (!isGeminiConfigured()) {
    return scenes.map(() => ({ visuals: null, error: MISSING_GEMINI_KEY_ERROR }));
  }

  const niche = resolveNicheProfile(nicheTheme);

  const systemInstruction = `You are the Visual Architect and Cinematic Director for a video pipeline.

For a single scene you produce: the ENVIRONMENT it happens in, the LIGHTING, and one CAMERA DIRECTION.

RULES:
1. Describe only what a camera can see. No emotions, no abstractions, no narration.
2. Never describe the characters themselves — their appearance is already locked by the Casting Director and will be supplied separately. Describe the world around them.
3. The camera direction must be a single concrete instruction, not a list of options.
4. Match this visual aesthetic throughout: ${visualAesthetic}.
5. Niche styling: ${niche.visualBias}
6. Honour the scene type you are given — it dictates shot scale. ESTABLISH means wide and sweeping; CLOSEUP and MACRO mean tight and intimate; DIVINE means overwhelming scale and god rays; ACTION means motion and energy.`;

  // Bounded parallelism — see `mapWithConcurrency` for why this is not Promise.all.
  return mapWithConcurrency(scenes, SCENE_AGENT_CONCURRENCY, async (scene, index) => {
    const relevantBlueprints = selectBlueprintsForScene(scene.sceneText, blueprints);

    const castingContext =
      relevantBlueprints.length > 0
        ? `Characters present (already locked — do NOT redescribe them, just place them):\n${relevantBlueprints
            .map((blueprint) => `- ${blueprint.name}: ${blueprint.appearance}; wearing ${blueprint.wardrobe}`)
            .join("\n")}`
        : "No locked characters in this scene.";

    try {
      const { object } = await generateObject({
        model: gemini(AGENT_MODEL),
        schema: SceneVisualsSchema,
        temperature: CREATIVE_TEMPERATURE,
        system: systemInstruction,
        prompt: `Topic: ${topic}
Scene type: ${scene.sceneType}

Narration for this scene:
"${scene.sceneText}"

${castingContext}

Design the environment, lighting and camera direction for this scene.`,
      });

      return { visuals: object };
    } catch (error) {
      console.error(`[Visual Architect] Scene ${index + 1} failed:`, error);
      return { visuals: null, error: (error as Error).message };
    }
  });
}
