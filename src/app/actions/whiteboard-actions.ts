"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript, generateActOutlines } from "@/lib/ai/script-writer";
import { sliceScriptIntoScenes } from "@/app/actions/slicer-actions";
import { enrichAndPersistScenes } from "@/app/actions/orchestrator-actions";
import { resolveDurationProfile } from "@/lib/ai/generation-rules";

/**
 * Per-act generation for the Whiteboard workflow
 * (`implementation_plans/04-script-writer-and-generation-ui.md`).
 *
 * `createAndGenerateVideo` runs every Act inside one server action. That is fine for a
 * 60-second video, but a 20-25 minute one is ~9 Acts and 150-250 scenes — at two agent
 * calls per scene that is 70+ minutes in a single request, showing the user a frozen
 * spinner and losing everything if Act 7 fails.
 *
 * These actions split the same pipeline into resumable units the client drives one at a
 * time: the Whiteboard can render Act 1 while Act 2 is still generating, show real
 * progress, and retry a single failed Act instead of the whole video.
 */

export interface ActOutline {
  actNumber: number;
  title: string;
  description: string;
}

export interface CreateProjectResult {
  success: boolean;
  projectId?: string;
  acts?: ActOutline[];
  /** True when the duration tier is single-pass rather than Act-chunked. */
  isSinglePass?: boolean;
  error?: string;
}

/**
 * Step 1 — create the project row and plan its Act structure.
 *
 * Deliberately does no script or scene work: it returns fast so the Whiteboard can
 * paint the full Act skeleton immediately and fill each card in as it generates.
 */
export async function createProjectWithActs(params: {
  workspaceId: string;
  workspaceTheme: string;
  topic: string;
  narrativeArc: string;
  scriptHook: string;
  visualAesthetic: string;
  targetDuration: string;
}): Promise<CreateProjectResult> {
  const {
    workspaceId,
    workspaceTheme,
    topic,
    narrativeArc,
    scriptHook,
    visualAesthetic,
    targetDuration,
  } = params;

  if (!topic) return { success: false, error: "Topic is required" };

  const supabase = await createClient();
  const duration = resolveDurationProfile(targetDuration);

  const { data: project, error } = await supabase
    .from("video_projects")
    .insert([
      {
        workspace_id: workspaceId,
        topic,
        narrative_arc: narrativeArc,
        story_hook: scriptHook,
        visual_aesthetic: visualAesthetic,
        status: "pending",
        master_script: "",
      },
    ])
    .select()
    .single();

  if (error || !project) {
    console.error("[Whiteboard] Failed to create project:", error);
    return { success: false, error: error?.message || "Failed to create project" };
  }

  // Short and mid-form are a single pass — one "Act" covering the whole script, so the
  // Whiteboard renders one card and the same per-act code path still applies.
  if (!duration.isLongForm) {
    return {
      success: true,
      projectId: project.id,
      isSinglePass: true,
      acts: [
        {
          actNumber: 1,
          title: duration.label,
          description: narrativeArc || topic,
        },
      ],
    };
  }

  const actOutlinesRes = await generateActOutlines(
    topic,
    narrativeArc,
    workspaceTheme,
    targetDuration
  );

  if (!actOutlinesRes.success || !actOutlinesRes.acts) {
    return {
      success: false,
      projectId: project.id,
      error: actOutlinesRes.error || "Failed to generate Act outlines.",
    };
  }

  return {
    success: true,
    projectId: project.id,
    isSinglePass: false,
    acts: actOutlinesRes.acts,
  };
}

export interface GeneratedActScene {
  id: string;
  sequenceNumber: number;
  voiceOverText: string;
  sceneType: string;
  estimatedDurationSeconds: number;
  finalVideoPrompt: string;
  /** True when agents 4-7 could not run and the slicer's raw prompt was kept. */
  usedFallback: boolean;
}

export interface GenerateActResult {
  success: boolean;
  scriptLines?: string[];
  scenes?: GeneratedActScene[];
  /** Non-fatal problems (rate limits, skipped safety passes) for this Act only. */
  warnings: string[];
  error?: string;
}

/**
 * Step 2 — run the full agent chain for one Act: Script Writer → Scene Slicer →
 * Casting Director → Visual Architect/Cinematic Director → Prompt Assembler →
 * Safety Officer.
 *
 * Called once per Act by the Whiteboard, sequentially.
 */
export async function generateAct(params: {
  projectId: string;
  workspaceTheme: string;
  topic: string;
  narrativeArc: string;
  scriptHook: string;
  visualAesthetic: string;
  targetDuration: string;
  startingSequenceNumber: number;
  /** Omitted for single-pass (short/mid-form) generation. */
  act?: ActOutline;
}): Promise<GenerateActResult> {
  const {
    projectId,
    workspaceTheme,
    topic,
    narrativeArc,
    scriptHook,
    visualAesthetic,
    targetDuration,
    startingSequenceNumber,
    act,
  } = params;

  const warnings: string[] = [];
  const aesthetic = visualAesthetic || "Cinematic";

  // --- Agent 1: Script Writer ----------------------------------------------------
  const scriptResult = await generateScript({
    topic,
    narrativeArc,
    hook: scriptHook,
    visualAesthetic: aesthetic,
    pov: "Third-person omnipresent",
    nicheTheme: workspaceTheme,
    targetDuration,
    ...(act ? { actOutline: { actNumber: act.actNumber, description: act.description } } : {}),
  });

  if (!scriptResult.success || !scriptResult.scriptLines) {
    return { success: false, warnings, error: scriptResult.error || "Script generation failed." };
  }

  const scriptLines = scriptResult.scriptLines;
  const actScriptText = scriptLines.join("\n\n");

  // --- Agent 2: Scene Slicer -----------------------------------------------------
  const slicerResult = await sliceScriptIntoScenes({
    projectId,
    fullScript: actScriptText,
    startingSequenceNumber,
    nicheTheme: workspaceTheme,
    targetDuration,
  });

  if (!slicerResult.success || !slicerResult.scenes || !slicerResult.sceneIds) {
    return {
      success: false,
      scriptLines,
      warnings,
      error: slicerResult.error || "Scene slicing failed.",
    };
  }

  const slicedScenes = slicerResult.scenes;
  const sceneIds = slicerResult.sceneIds;

  // --- Agents 3-7: enrichment ----------------------------------------------------
  const enrichment = await enrichAndPersistScenes({
    projectId,
    sceneIds,
    slicedScenes,
    topic,
    visualAesthetic: aesthetic,
    nicheTheme: workspaceTheme,
  });

  warnings.push(...enrichment.warnings);
  if (!enrichment.success && enrichment.error) {
    warnings.push(enrichment.error);
  }

  // Read back so the Whiteboard shows what is actually stored, not what we hoped was.
  const supabase = await createClient();
  const { data: storedScenes } = await supabase
    .from("scenes")
    .select("id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt")
    .in("id", sceneIds)
    .order("sequence_number");

  const scenes: GeneratedActScene[] = (storedScenes ?? []).map((row, index) => ({
    id: row.id as string,
    sequenceNumber: row.sequence_number as number,
    voiceOverText: (row.voice_over_beat as string) ?? "",
    sceneType: (row.scene_type as string) ?? slicedScenes[index]?.sceneType ?? "",
    estimatedDurationSeconds: Number(row.video_duration ?? 0),
    finalVideoPrompt: (row.final_video_prompt as string) ?? "",
    // The slicer's prompt surviving unchanged means agents 4-7 did not reach this scene.
    usedFallback: (row.final_video_prompt as string) === slicedScenes[index]?.visualPrompt,
  }));

  return { success: true, scriptLines, scenes, warnings };
}

/**
 * Step 3 — stitch the approved Act scripts into the project's master script.
 *
 * Called once after every Act has generated, so a partially generated project never
 * overwrites a good master script with a truncated one.
 */
export async function finalizeProjectScript(params: {
  projectId: string;
  acts: Array<{ actNumber: number; title: string; scriptLines: string[] }>;
}): Promise<{ success: boolean; error?: string }> {
  const { projectId, acts } = params;
  const supabase = await createClient();

  const masterScript = acts
    .map((act) =>
      acts.length > 1
        ? `=== ACT ${act.actNumber}: ${act.title} ===\n\n${act.scriptLines.join("\n\n")}`
        : act.scriptLines.join("\n\n")
    )
    .join("\n\n");

  const { error } = await supabase
    .from("video_projects")
    .update({ status: "drafting", master_script: masterScript.trim() })
    .eq("id", projectId);

  if (error) {
    console.error("[Whiteboard] Failed to finalize master script:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Persists a user's edit to an Act's scenes after they revise text on the Whiteboard.
 * Scoped to one Act so editing Act 2 never touches Acts 1 or 3.
 */
export async function updateSceneVoiceover(
  sceneId: string,
  voiceOverText: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("scenes")
    .update({ voice_over_beat: voiceOverText })
    .eq("id", sceneId);

  if (error) {
    console.error("[Whiteboard] Failed to update scene voiceover:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}
