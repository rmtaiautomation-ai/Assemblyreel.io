"use server";

import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  NARRATION_WORDS_PER_MINUTE,
  SCENE_TYPES,
  resolveDurationProfile,
} from "@/lib/ai/generation-rules";
import { resolveFormatProfile, type FormatProfile } from "@/lib/ai/format-profile";
import {
  AGENT_MODEL,
  OBJECT_PROVIDER_OPTIONS,
  STRUCTURED_TEMPERATURE,
  openai,
} from "@/lib/ai/openai-provider";
import { acquireCallSlot } from "@/lib/ai/concurrency";

/**
 * Built per-call rather than once at module scope, so the "words per second" hint in
 * `estimatedDurationSeconds` reflects the channel's actual delivery speed — a
 * `forensic-documentary` script read at 135 wpm takes longer per word than a 150 wpm
 * default, and an estimate built against the wrong pace pushes every scene's initial
 * duration guess off before any real audio exists to correct it.
 *
 * The Zod description string carries no weight in the inferred TS type, so a schema
 * built with the legacy 150 wpm default is a safe, permanent source for `SlicedScene`.
 */
function buildSceneSliceSchema(wordsPerSecond: number) {
  return z.object({
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
              `How long this text takes to speak at roughly ${wordsPerSecond.toFixed(1)} words per second.`
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
}

const DEFAULT_SCENE_SLICE_SCHEMA = buildSceneSliceSchema(NARRATION_WORDS_PER_MINUTE / 60);

export type SlicedScene = z.infer<typeof DEFAULT_SCENE_SLICE_SCHEMA>["scenes"][number];

export interface SliceScriptParams {
  projectId: string;
  fullScript: string;
  startingSequenceNumber?: number;
  /** Workspace content theme — the legacy fallback when no profile is supplied. */
  nicheTheme?: string;
  /** `target_duration` form value — drives pacing and scene length. */
  targetDuration?: string;
  /** The channel's resolved format spec; falls back to `nicheTheme`. See generateScript. */
  formatProfile?: FormatProfile;
}

export async function sliceScriptIntoScenes({
  projectId,
  fullScript,
  startingSequenceNumber = 1,
  nicheTheme,
  targetDuration,
  formatProfile,
}: SliceScriptParams) {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY is missing in environment variables." };
  }

  const profile = formatProfile ?? resolveFormatProfile({ nicheTheme });
  const duration = resolveDurationProfile(targetDuration);

  try {
    console.log(
      `[Slicer Agent] Slicing project ${projectId} — ${duration.label}, format "${profile.key}".`
    );

    await acquireCallSlot();
    const { object } = await generateObject({
      model: openai(AGENT_MODEL),
      providerOptions: OBJECT_PROVIDER_OPTIONS,
      schema: buildSceneSliceSchema(profile.delivery.wordsPerMinute / 60),
      temperature: STRUCTURED_TEMPERATURE,
      system: `You are the Scene B-roll Slicer. You take a complete voiceover script and break it into distinct visual beats (Scenes).

CRITICAL RULES:
1. Pacing Strategy: ${duration.pacingRule}
2. Tone Overrides: ${profile.visual.visualBias}
3. Voiceover Exact Match: the 'voiceOverText' of all scenes concatenated in order MUST EXACTLY MATCH the original script. Never skip, summarise, reorder or reword.
4. Scene Types: choose from ${SCENE_TYPES.join(", ")}. Favour ${profile.visual.preferredSceneTypes.join(", ")} for this niche.
5. ${
        // Off by default — untouched from before this rule existed, so every channel
        // that has not opted in keeps exactly today's behaviour. On, this replaces a
        // duration target with a content judgment: duration was only ever a proxy for
        // "how many pictures does this line need," and a proxy is what produced one
        // 13-second clip out of a sentence naming four different things.
        profile.visual.contentAwareSlicing
          ? `Content-Aware Slicing: decide the cut points from what the line actually shows, not from a target duration. Count only the images this stretch of narration AFFIRMS — a line naming something only to deny it ("not a trial, not a choir, a holding pen") gets no image for the denied things, because showing them on screen asserts the opposite of what the words say. One affirmed idea is one scene; several affirmed ideas in one sentence is several scenes; do not split further just to hit a length. Judge each stretch on what best serves a viewer watching it, the way a human editor would, not by measuring seconds.`
          : `Organic Slicing: you decide the total scene count from the pacing strategy and the density of the script. Do not force an artificial limit — target roughly ${duration.sceneDurationSeconds.min}-${duration.sceneDurationSeconds.max} seconds per scene and let the visual flow stay natural.`
      }
6. Cut to a new scene whenever the visual subject changes.${
        // Appended only when the format declares one, so a migrated preset's prompt is
        // unchanged from before the blueprint existed.
        profile.visual.stillTreatment
          ? `\n7. Still Treatment: ${profile.visual.stillTreatment}`
          : ""
      }`,
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
