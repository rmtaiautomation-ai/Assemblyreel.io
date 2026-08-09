import { resolveNicheProfile, type SceneType } from "../generation-rules";
import { selectBlueprintsForScene, type CharacterBlueprints } from "./casting-director";
import type { SceneVisuals } from "./visual-architect";

/**
 * Agent 6 — The Prompt Assembler (The Compiler).
 *
 * Pure string compilation, deliberately no LLM call: every input has already been
 * validated by an upstream agent, so an extra model round-trip here would add latency
 * and a hallucination surface for zero gain. Plan 03 specifies this explicitly.
 */

/** Plan 07's target prompt density. Image/video models degrade past roughly this. */
const TARGET_PROMPT_WORDS = 120;

export interface AssemblePromptParams {
  sceneText: string;
  sceneType: SceneType;
  visuals: SceneVisuals;
  blueprints: CharacterBlueprints;
  visualAesthetic: string;
  nicheTheme?: string;
}

/**
 * Segments are emitted in descending order of importance, because `trimToWordBudget`
 * drops from the tail — whatever sits last is what a dense scene sacrifices.
 *
 * `visualAesthetic` and the niche style tag sit ahead of `lighting` deliberately.
 * Style is what holds scene 40 visually consistent with scene 1, and losing it
 * reintroduces exactly the drift the Casting Director exists to prevent; lighting is
 * per-scene mood and is the cheaper thing to lose.
 */
export function assembleVideoPrompt({
  sceneText,
  sceneType,
  visuals,
  blueprints,
  visualAesthetic,
  nicheTheme,
}: AssemblePromptParams): string {
  const niche = resolveNicheProfile(nicheTheme);
  const presentCharacters = selectBlueprintsForScene(sceneText, blueprints);

  const subjectSegment = presentCharacters
    .map(
      (blueprint) =>
        `${blueprint.name}, ${blueprint.appearance}, wearing ${blueprint.wardrobe}, ${blueprint.demeanor}`
    )
    .join(". ");

  const segments = [
    visuals.cameraDirection,
    subjectSegment,
    visuals.environment,
    visualAesthetic,
    niche.promptStyleTag,
    visuals.lighting,
    `${sceneType.toLowerCase()} shot`,
  ].filter((segment) => segment && segment.trim().length > 0);

  return trimToWordBudget(segments.join(". "), TARGET_PROMPT_WORDS);
}

/**
 * Trims to a whole-sentence boundary under the budget, so the prompt never ends
 * mid-clause. Falls back to a hard word cut only when the first sentence alone
 * already exceeds the budget.
 */
function trimToWordBudget(prompt: string, maxWords: number): string {
  const normalized = prompt.replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim();
  const words = normalized.split(" ");

  if (words.length <= maxWords) return normalized;

  const truncated = words.slice(0, maxWords).join(" ");
  const lastSentenceEnd = truncated.lastIndexOf(".");

  if (lastSentenceEnd > 0) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  return `${truncated}.`;
}
