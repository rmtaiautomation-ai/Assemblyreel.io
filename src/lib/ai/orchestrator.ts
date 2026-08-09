import { castCharacters, type CharacterBlueprints } from "./agents/casting-director";
import { designSceneVisuals } from "./agents/visual-architect";
import { assembleVideoPrompt } from "./agents/prompt-assembler";
import { reviewPromptsSafety } from "./agents/safety-officer";
import type { SceneType } from "./generation-rules";

/**
 * The 7-Agent orchestrator.
 *
 * Agents 1 (Script Writer) and 2 (Scene Slicer) already run inside
 * `createAndGenerateVideo`, which owns project creation and the Act loop. This module
 * picks up from their output and runs the visual half of the pipeline — agents 3
 * through 7 — turning sliced narration beats into final, filter-safe video prompts.
 *
 * Execution is a plain sequential `await` chain, per plan 03's note that this app runs
 * single-machine with no imposed request timeout. No streaming, no job queue.
 */

export interface SceneToEnrich {
  sceneText: string;
  sceneType: SceneType;
  /** The Scene Slicer's own prompt, used as fallback if the visual pass fails. */
  fallbackVisualPrompt: string;
}

export interface EnrichedScene {
  finalVideoPrompt: string;
  environment: string | null;
  lighting: string | null;
  cameraDirection: string | null;
  /** True when this scene fell back to the slicer's prompt instead of the full chain. */
  usedFallback: boolean;
  safetyModified: boolean;
}

export interface OrchestrationParams {
  scenes: readonly SceneToEnrich[];
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
}

export interface OrchestrationResult {
  success: boolean;
  scenes?: EnrichedScene[];
  blueprints?: CharacterBlueprints;
  /** Non-fatal problems worth surfacing to the user without failing the run. */
  warnings: string[];
  error?: string;
}

export async function enrichScenesWithVisualPrompts({
  scenes,
  topic,
  visualAesthetic,
  nicheTheme,
}: OrchestrationParams): Promise<OrchestrationResult> {
  const warnings: string[] = [];

  if (scenes.length === 0) {
    return { success: false, warnings, error: "No scenes to enrich." };
  }

  // --- Agent 3: Casting Director -------------------------------------------------
  // A casting failure is survivable: scenes still render, they just lose cross-scene
  // character consistency. Degrade with a warning rather than abandoning the run.
  const casting = await castCharacters({
    sceneTexts: scenes.map((scene) => scene.sceneText),
    topic,
    visualAesthetic,
    nicheTheme,
  });

  const blueprints: CharacterBlueprints = casting.blueprints ?? {};

  if (!casting.success) {
    warnings.push(
      `Casting Director failed (${casting.error}). Characters may drift between scenes.`
    );
  }

  // --- Agents 4 & 5: Visual Architect + Cinematic Director ------------------------
  const visualResults = await designSceneVisuals({
    scenes: scenes.map(({ sceneText, sceneType }) => ({ sceneText, sceneType })),
    blueprints,
    topic,
    visualAesthetic,
    nicheTheme,
  });

  const failedVisualCount = visualResults.filter((result) => !result.visuals).length;
  if (failedVisualCount > 0) {
    warnings.push(
      `${failedVisualCount} of ${scenes.length} scenes fell back to the slicer's prompt because the visual pass failed.`
    );
  }

  // --- Agent 6: Prompt Assembler (pure TypeScript) --------------------------------
  const assembledPrompts = scenes.map((scene, index) => {
    const visuals = visualResults[index].visuals;
    if (!visuals) return scene.fallbackVisualPrompt;

    return assembleVideoPrompt({
      sceneText: scene.sceneText,
      sceneType: scene.sceneType,
      visuals,
      blueprints,
      visualAesthetic,
      nicheTheme,
    });
  });

  // --- Agent 7: Safety Officer ----------------------------------------------------
  const safetyReviews = await reviewPromptsSafety(assembledPrompts);

  const failedSafetyCount = safetyReviews.filter((review) => review.reviewFailed).length;
  if (failedSafetyCount > 0) {
    warnings.push(
      `${failedSafetyCount} prompts skipped the safety pass and were sent through unmodified.`
    );
  }

  const enrichedScenes: EnrichedScene[] = scenes.map((_, index) => {
    const visuals = visualResults[index].visuals;
    return {
      finalVideoPrompt: safetyReviews[index].safePrompt,
      environment: visuals?.environment ?? null,
      lighting: visuals?.lighting ?? null,
      cameraDirection: visuals?.cameraDirection ?? null,
      usedFallback: !visuals,
      safetyModified: safetyReviews[index].wasModified,
    };
  });

  const modifiedCount = enrichedScenes.filter((scene) => scene.safetyModified).length;
  console.log(
    `[Orchestrator] Enriched ${enrichedScenes.length} scenes — ` +
      `${Object.keys(blueprints).length} blueprints, ${modifiedCount} prompts softened, ` +
      `${failedVisualCount} fallbacks.`
  );

  return { success: true, scenes: enrichedScenes, blueprints, warnings };
}
