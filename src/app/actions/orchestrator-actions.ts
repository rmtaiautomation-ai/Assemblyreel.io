"use server";

import { createClient } from "@/lib/supabase/server";
import { enrichScenesWithVisualPrompts } from "@/lib/ai/orchestrator";
import type { CharacterBlueprints } from "@/lib/ai/agents/casting-director";
import { SCENE_AGENT_CONCURRENCY, mapWithConcurrency } from "@/lib/ai/concurrency";
import type { SlicedScene } from "./slicer-actions";

const MIGRATION_HINT =
  "Run db/add-agent-pipeline-columns.sql in the Supabase SQL editor to persist scene metadata and character blueprints.";

export interface EnrichScenesParams {
  projectId: string;
  /** Scene row ids returned by the slicer, index-aligned with `slicedScenes`. */
  sceneIds: readonly string[];
  slicedScenes: readonly SlicedScene[];
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
  /**
   * Cast once for the whole project and passed down, rather than re-cast per call.
   * See `OrchestrationParams.blueprints` — casting per Act is what let a character
   * change appearance between chapters of a long-form video.
   */
  blueprints?: CharacterBlueprints;
}

export interface EnrichScenesResult {
  success: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Runs agents 3-7 over freshly sliced scenes and writes the results back.
 *
 * The two writes are deliberately separate. `final_video_prompt` already exists on
 * `scenes` and is what actually reaches the video provider, so it is written on its
 * own and must succeed. The metadata columns arrive with a migration the user runs by
 * hand, so that write is best-effort — a project that has not run the migration still
 * generates correctly, it just loses the explanatory detail.
 */
export async function enrichAndPersistScenes({
  projectId,
  sceneIds,
  slicedScenes,
  topic,
  visualAesthetic,
  nicheTheme,
  blueprints,
}: EnrichScenesParams): Promise<EnrichScenesResult> {
  if (sceneIds.length !== slicedScenes.length) {
    return {
      success: false,
      warnings: [],
      error: `Scene id count (${sceneIds.length}) does not match sliced scene count (${slicedScenes.length}).`,
    };
  }

  const orchestration = await enrichScenesWithVisualPrompts({
    scenes: slicedScenes.map((scene) => ({
      sceneText: scene.voiceOverText,
      sceneType: scene.sceneType,
      fallbackVisualPrompt: scene.visualPrompt,
    })),
    topic,
    visualAesthetic,
    nicheTheme,
    blueprints,
  });

  if (!orchestration.success || !orchestration.scenes) {
    return {
      success: false,
      warnings: orchestration.warnings,
      error: orchestration.error ?? "Orchestration failed.",
    };
  }

  const enrichedScenes = orchestration.scenes;
  const warnings = [...orchestration.warnings];
  const supabase = await createClient();

  // --- Required write: the prompt that actually reaches the video provider ---------
  const promptWriteErrors = await mapWithConcurrency(
    sceneIds,
    SCENE_AGENT_CONCURRENCY,
    async (sceneId, index) => {
      const { error } = await supabase
        .from("scenes")
        .update({ final_video_prompt: enrichedScenes[index].finalVideoPrompt })
        .eq("id", sceneId);
      return error?.message ?? null;
    }
  );

  const failedPromptWrites = promptWriteErrors.filter(Boolean);
  if (failedPromptWrites.length > 0) {
    return {
      success: false,
      warnings,
      error: `Failed to save ${failedPromptWrites.length} enriched prompts: ${failedPromptWrites[0]}`,
    };
  }

  // --- Best-effort write: metadata gated behind the manual migration --------------
  const metadataErrors = await mapWithConcurrency(
    sceneIds,
    SCENE_AGENT_CONCURRENCY,
    async (sceneId, index) => {
      const scene = enrichedScenes[index];
      const { error } = await supabase
        .from("scenes")
        .update({
          scene_type: slicedScenes[index].sceneType,
          environment: scene.environment,
          lighting: scene.lighting,
          camera_direction: scene.cameraDirection,
        })
        .eq("id", sceneId);
      return error?.message ?? null;
    }
  );

  const firstMetadataError = metadataErrors.find(Boolean);
  if (firstMetadataError) {
    warnings.push(`Scene metadata not saved (${firstMetadataError}). ${MIGRATION_HINT}`);
  }

  const { error: blueprintError } = await supabase
    .from("video_projects")
    .update({ character_blueprints: orchestration.blueprints ?? {} })
    .eq("id", projectId);

  if (blueprintError) {
    warnings.push(
      `Character blueprints not saved (${blueprintError.message}). ${MIGRATION_HINT}`
    );
  }

  return { success: true, warnings };
}
