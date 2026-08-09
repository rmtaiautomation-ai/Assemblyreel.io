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
  const isSinglePass = !duration.isLongForm;
  let acts: ActOutline[];

  if (isSinglePass) {
    acts = [
      {
        actNumber: 1,
        title: duration.label,
        description: narrativeArc || topic,
      },
    ];
  } else {
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

    acts = actOutlinesRes.acts;
  }

  // Best-effort: `act_outlines`/`target_duration` need db/add-act-persistence.sql. A
  // project generated before that migration runs still works — it just cannot be
  // resumed from the Whiteboard route later, same degrade-gracefully pattern as the
  // agent-pipeline columns.
  const { error: persistError } = await supabase
    .from("video_projects")
    .update({ act_outlines: acts, target_duration: targetDuration })
    .eq("id", project.id);

  if (persistError) {
    console.warn(
      "[Whiteboard] act_outlines/target_duration not saved — run db/add-act-persistence.sql:",
      persistError.message
    );
  }

  return { success: true, projectId: project.id, isSinglePass, acts };
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
  /** Which Act these scenes belong to — tags every scene this call creates. */
  actNumber: number;
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
    actNumber,
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

  const supabase = await createClient();

  // Best-effort: needs db/add-act-persistence.sql. Without it every scene defaults to
  // act_number 1, which only matters for resuming — this act's scenes are already
  // correctly grouped in the response below regardless.
  const { error: actTagError } = await supabase
    .from("scenes")
    .update({ act_number: actNumber })
    .in("id", sceneIds);

  if (actTagError) {
    warnings.push(
      `Act grouping not saved (${actTagError.message}). Run db/add-act-persistence.sql to enable resuming.`
    );
  }

  // Read back so the Whiteboard shows what is actually stored, not what we hoped was.
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

export interface ResumedWhiteboard {
  projectId: string;
  workspaceId: string;
  workspaceTheme: string;
  topic: string;
  narrativeArc: string;
  scriptHook: string;
  visualAesthetic: string;
  targetDuration: string;
  isSinglePass: boolean;
  acts: Array<{
    outline: ActOutline;
    scriptLines: string[];
    scenes: GeneratedActScene[];
  }>;
}

/**
 * Rebuilds a Whiteboard session from the database, so leaving the page and coming
 * back — or a hard refresh — does not lose which scenes belong to which Act.
 *
 * Degrades in three independent ways when `db/add-act-persistence.sql` has not run
 * yet: `act_outlines` comes back null (via `select("*")`, so a missing column is just
 * an absent key, not an error), so a single synthetic Act is reconstructed from
 * whatever scenes exist; `target_duration` comes back null for the same reason, so
 * pacing rules fall back to `generation-rules.ts`'s short-form default; and the scene
 * query below retries without `act_number` if that column doesn't exist yet, since
 * PostgREST fails an entire `select()` when *any* named column is missing — a first
 * live run of this route showed the scenes list coming back completely empty because
 * of exactly that, not because there were no scenes.
 */
export async function loadProjectForWhiteboard(
  projectId: string
): Promise<{ success: boolean; data?: ResumedWhiteboard; error?: string }> {
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("video_projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return { success: false, error: projectError?.message || "Project not found." };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("content_theme")
    .eq("id", project.workspace_id)
    .single();

  const SCENE_BASE_COLUMNS =
    "id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt";

  let sceneRows: Array<Record<string, unknown>> | null = null;

  const { data: sceneRowsWithAct, error: sceneError } = await supabase
    .from("scenes")
    .select(`${SCENE_BASE_COLUMNS}, act_number`)
    .eq("project_id", projectId)
    .order("sequence_number");

  if (sceneError) {
    const { data: fallbackRows } = await supabase
      .from("scenes")
      .select(SCENE_BASE_COLUMNS)
      .eq("project_id", projectId)
      .order("sequence_number");
    sceneRows = fallbackRows;
  } else {
    sceneRows = sceneRowsWithAct;
  }

  const scenes: (GeneratedActScene & { actNumber: number })[] = (sceneRows ?? []).map(
    (row) => ({
      id: row.id as string,
      sequenceNumber: row.sequence_number as number,
      voiceOverText: (row.voice_over_beat as string) ?? "",
      sceneType: (row.scene_type as string) ?? "",
      estimatedDurationSeconds: Number(row.video_duration ?? 0),
      finalVideoPrompt: (row.final_video_prompt as string) ?? "",
      // Read-back has no access to the slicer's original prompt, so a resumed session
      // cannot tell fallback scenes from enriched ones — the amber badge only ever
      // appears live, during generation. Acceptable: it is informational, and the
      // finalVideoPrompt itself is correct either way.
      usedFallback: false,
      actNumber: (row.act_number as number) ?? 1,
    })
  );

  const storedOutlines = project.act_outlines as ActOutline[] | null;
  const distinctActNumbers = [...new Set(scenes.map((s) => s.actNumber))].sort(
    (a, b) => a - b
  );

  const outlines: ActOutline[] =
    storedOutlines && storedOutlines.length > 0
      ? storedOutlines
      : distinctActNumbers.length > 0
        ? distinctActNumbers.map((n) => ({
            actNumber: n,
            title: `Act ${n}`,
            description: "",
          }))
        : [{ actNumber: 1, title: "Act 1", description: project.narrative_arc || project.topic }];

  const acts = outlines.map((outline) => ({
    outline,
    scriptLines: scenes
      .filter((s) => s.actNumber === outline.actNumber)
      .map((s) => s.voiceOverText),
    scenes: scenes
      .filter((s) => s.actNumber === outline.actNumber)
      .map(({ actNumber: _actNumber, ...scene }) => scene),
  }));

  return {
    success: true,
    data: {
      projectId: project.id,
      workspaceId: project.workspace_id,
      workspaceTheme: workspace?.content_theme ?? "",
      topic: project.topic ?? "",
      narrativeArc: project.narrative_arc ?? "",
      scriptHook: project.story_hook ?? "",
      visualAesthetic: project.visual_aesthetic ?? "",
      targetDuration: (project.target_duration as string) ?? "Short (< 60s)",
      isSinglePass: outlines.length <= 1,
      acts,
    },
  };
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
