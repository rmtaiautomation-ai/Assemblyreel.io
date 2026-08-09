import { generateObject } from "ai";
import { z } from "zod";
import {
  AGENT_MODEL,
  MISSING_GEMINI_KEY_ERROR,
  STRUCTURED_TEMPERATURE,
  gemini,
  isGeminiConfigured,
} from "../gemini-provider";
import { resolveNicheProfile } from "../generation-rules";
import { acquireCallSlot } from "../concurrency";

/**
 * Agent 3 — The Casting Director.
 *
 * Reads the whole sliced script and locks in a rigid visual blueprint for every
 * recurring subject, so the downstream image/video model cannot quietly restyle a
 * character between scene 1 and scene 40. This is the only agent that needs to see
 * every scene at once; agents 4-7 work per-scene.
 */

const CharacterBlueprintSchema = z.object({
  name: z
    .string()
    .describe("The character or recurring subject's name exactly as it appears in the script."),
  appearance: z
    .string()
    .describe(
      "Fixed physical description: age, build, hair, skin tone, distinguishing features. Must never change between scenes."
    ),
  wardrobe: z
    .string()
    .describe("Fixed clothing, armour, colours and accessories worn throughout the video."),
  demeanor: z
    .string()
    .describe("Posture, bearing and typical expression — how this subject carries themselves."),
});

const CastingSchema = z.object({
  characters: z
    .array(CharacterBlueprintSchema)
    .describe(
      "Every recurring visual subject. Omit one-off background figures who appear in a single scene."
    ),
});

export type CharacterBlueprint = z.infer<typeof CharacterBlueprintSchema>;

/** Keyed by lowercased character name for cheap lookup by the Visual Architect. */
export type CharacterBlueprints = Record<string, CharacterBlueprint>;

export interface CastingDirectorParams {
  /** Voiceover text of every scene, in order. */
  sceneTexts: readonly string[];
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
}

export interface CastingDirectorResult {
  success: boolean;
  blueprints?: CharacterBlueprints;
  error?: string;
}

export async function castCharacters({
  sceneTexts,
  topic,
  visualAesthetic,
  nicheTheme,
}: CastingDirectorParams): Promise<CastingDirectorResult> {
  if (!isGeminiConfigured()) {
    return { success: false, error: MISSING_GEMINI_KEY_ERROR };
  }

  const niche = resolveNicheProfile(nicheTheme);

  try {
    await acquireCallSlot();
    const { object } = await generateObject({
      model: gemini(AGENT_MODEL),
      schema: CastingSchema,
      temperature: STRUCTURED_TEMPERATURE,
      system: `You are the Casting Director for a cinematic video pipeline.

Your job is to read an entire script and lock in an immutable visual blueprint for every recurring subject, so that an AI image/video generator renders them identically in every scene.

RULES:
1. Only include subjects that appear in more than one scene, or who are central to the story. Ignore incidental background figures.
2. Descriptions must be concrete and visual — colours, materials, physical traits. Never abstract ("noble bearing" is weak; "broad-shouldered, scarred jaw, upright military posture" is right).
3. Never include actions, camera directions or locations. Those belong to other agents. Describe only what the subject permanently looks like.
4. Style the descriptions to match this visual aesthetic: ${visualAesthetic}.
5. Niche styling: ${niche.visualBias}
6. If the script has no recurring human or creature subjects (for example, a purely abstract or landscape piece), return an empty array.`,
      prompt: `Topic: ${topic}
Niche: ${nicheTheme || "General"}

Full script, one scene per line:
${sceneTexts.map((text, index) => `${index + 1}. ${text}`).join("\n")}

Identify every recurring visual subject and produce their locked blueprints.`,
    });

    const blueprints: CharacterBlueprints = Object.fromEntries(
      object.characters.map((character) => [character.name.toLowerCase(), character])
    );

    console.log(
      `[Casting Director] Locked ${object.characters.length} character blueprint(s).`
    );

    return { success: true, blueprints };
  } catch (error) {
    console.error("[Casting Director] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Selects the blueprints a single scene actually needs, by name mention.
 *
 * Passing all blueprints into every scene prompt would blow the Prompt Assembler's
 * 120-word budget on characters who are not on screen.
 */
export function selectBlueprintsForScene(
  sceneText: string,
  blueprints: CharacterBlueprints
): CharacterBlueprint[] {
  const normalizedScene = sceneText.toLowerCase();
  return Object.entries(blueprints)
    .filter(([name]) => normalizedScene.includes(name))
    .map(([, blueprint]) => blueprint);
}
