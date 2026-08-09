"use server";

import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  NARRATION_WORDS_PER_MINUTE,
  SCENE_TYPES,
  resolveDurationProfile,
  resolveNicheProfile,
} from "@/lib/ai/generation-rules";
import { AGENT_MODEL, STRUCTURED_TEMPERATURE, gemini } from "@/lib/ai/gemini-provider";
import { acquireCallSlot } from "@/lib/ai/concurrency";

const NARRATION_WORDS_PER_SECOND = NARRATION_WORDS_PER_MINUTE / 60;

const SceneSliceSchema = z.object({
  scenes: z
    .array(
      z.object({
        sceneNumber: z
          .number()
          .int()
          .describe("Sequential order of the scene, starting at 1."),
        voiceOverText: z
          .string()
          .describe(
            "The exact text chunk from the original script to be spoken. Must match the original script word-for-word without skipping anything."
          ),
        visualPrompt: z
          .string()
          .describe(
            "A highly detailed cinematic prompt for an AI video generator describing what we see while this text is spoken."
          ),
        estimatedDurationSeconds: z
          .number()
          .positive()
          .describe(
            `How long this text takes to speak at roughly ${NARRATION_WORDS_PER_SECOND.toFixed(1)} words per second.`
          ),
        sceneType: z
          .enum(SCENE_TYPES)
          .describe("The cinematic role this scene plays in the sequence."),
        mediaType: z
          .enum(["video", "image"])
          .describe(
            "Default to 'video' for dynamic scenes; use 'image' only when the scene needs a static graphic like a chart or map."
          ),
      })
    )
    .min(1)
    .describe("Scenes sliced organically from the script, in narration order."),
});

export type SlicedScene = z.infer<typeof SceneSliceSchema>["scenes"][number];

export interface SliceScriptParams {
  projectId: string;
  fullScript: string;
  startingSequenceNumber?: number;
  /** Workspace content theme — drives the Niche/Tone Matrix. */
  nicheTheme?: string;
  /** `target_duration` form value — drives pacing and scene length. */
  targetDuration?: string;
}

export async function sliceScriptIntoScenes({
  projectId,
  fullScript,
  startingSequenceNumber = 1,
  nicheTheme,
  targetDuration,
}: SliceScriptParams) {
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY is missing in environment variables." };
  }

  const niche = resolveNicheProfile(nicheTheme);
  const duration = resolveDurationProfile(targetDuration);

  try {
    console.log(
      `[Slicer Agent] Slicing project ${projectId} — ${duration.label}, niche "${niche.key}".`
    );

    await acquireCallSlot();
    const { object } = await generateObject({
      model: gemini(AGENT_MODEL),
      schema: SceneSliceSchema,
      temperature: STRUCTURED_TEMPERATURE,
      system: `You are the Scene B-roll Slicer. You take a complete voiceover script and break it into distinct visual beats (Scenes).

CRITICAL RULES:
1. Pacing Strategy: ${duration.pacingRule}
2. Tone Overrides: ${niche.visualBias}
3. Voiceover Exact Match: the 'voiceOverText' of all scenes concatenated in order MUST EXACTLY MATCH the original script. Never skip, summarise, reorder or reword.
4. Scene Types: choose from ${SCENE_TYPES.join(", ")}. Favour ${niche.preferredSceneTypes.join(", ")} for this niche.
5. Organic Slicing: you decide the total scene count from the pacing strategy and the density of the script. Do not force an artificial limit — target roughly ${duration.sceneDurationSeconds.min}-${duration.sceneDurationSeconds.max} seconds per scene and let the visual flow stay natural.
6. Cut to a new scene whenever the visual subject changes.`,
      prompt: `Niche: ${nicheTheme || "General"}
Target runtime tier: ${duration.label}

Script to slice:
"""
${fullScript}
"""

Slice this script into scenes following the rules exactly.`,
    });

    const slicedScenes = object.scenes;
    console.log(`[Slicer Agent] Sliced into ${slicedScenes.length} scenes.`);

    const supabase = await createClient();

    const scenesToInsert = slicedScenes.map((scene, index) => ({
      project_id: projectId,
      sequence_number: startingSequenceNumber + index,
      voice_over_beat: scene.voiceOverText,
      final_video_prompt: scene.visualPrompt,
      video_duration: scene.estimatedDurationSeconds,
      custom_media_type: scene.mediaType,
      generation_status: "Pending",
    }));

    // `.select()` so the caller gets the generated ids — the orchestrator needs them to
    // write each scene's enriched prompt back without re-querying.
    const { data: insertedScenes, error: insertError } = await supabase
      .from("scenes")
      .insert(scenesToInsert)
      .select("id, sequence_number");

    if (insertError) {
      console.error("[Slicer Agent] Database insertion error:", insertError);
      return { success: false, error: "Failed to save scenes to database" };
    }

    // Supabase returns inserted rows in statement order, but sort defensively: the
    // enrichment step pairs these by index against `slicedScenes`.
    const sceneIds = (insertedScenes ?? [])
      .slice()
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((row) => row.id as string);

    return { success: true, scenes: slicedScenes, sceneIds };
  } catch (error) {
    console.error("[Slicer Agent] Error slicing script:", error);
    return { success: false, error: (error as Error).message };
  }
}
