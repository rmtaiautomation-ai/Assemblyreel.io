"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript, generateActOutlines } from "@/lib/ai/script-writer";
import { sliceScriptIntoScenes } from "@/app/actions/slicer-actions";
import { enrichAndPersistScenes } from "@/app/actions/orchestrator-actions";
import { resolveDurationProfile } from "@/lib/ai/generation-rules";
import {
  generateActNarration,
  generateFullNarration,
  getActNarrations,
  recomputeActLayout,
  type ActNarration,
} from "./audio-actions";
import { castCharacters } from "@/lib/ai/agents/casting-director";
import type { SlicedScene } from "./slicer-actions";

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
 * Step 2 — write one Act: Script Writer → Scene Slicer. Nothing visual.
 *
 * Agents 3-7 used to run here too, which meant ~2 provider calls per scene were spent
 * on a script the user had not approved yet — around 300 calls for a 25-minute video,
 * and at the free tier's 13s spacing that is over an hour of throttled work thrown
 * away the moment any Act is rewritten. Worse, the Casting Director ran once per Act
 * and so never saw more than one chapter, defeating the very cross-scene consistency
 * it exists to provide.
 *
 * The visual pass now lives in `approveAndGenerateVisuals`, which runs once over the
 * finished project. See implementation_plans/16-long-form-audio-first-pipeline.md.
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

  // Agents 3-7 deliberately do NOT run here — see this function's doc comment.
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
    // Always true at this stage: the visual pass has not run, so every scene is still
    // holding the Scene Slicer's raw prompt. Kept on the shape because the Whiteboard
    // reuses it after `approveAndGenerateVisuals`, where it means what it says.
    usedFallback: true,
  }));

  return { success: true, scriptLines, scenes, warnings };
}

/**
 * Step 3 — stitch the approved Act scripts into the project's master script and record
 * the narration.
 *
 * Called once after every Act has generated, so a partially generated project never
 * overwrites a good master script with a truncated one.
 *
 * Long-form narrates one Act at a time into `act_narrations`; short/mid-form keeps the
 * single-file `generateFullNarration`. The project lands on `narrated` rather than
 * `drafting` for long-form, because there is still an explicit approval step before the
 * visual pass runs.
 */
export async function finalizeProjectScript(params: {
  projectId: string;
  acts: Array<{ actNumber: number; title: string; scriptLines: string[] }>;
}): Promise<{ success: boolean; warnings?: string[]; error?: string }> {
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
    .update({ master_script: masterScript.trim() })
    .eq("id", projectId);

  if (error) {
    console.error("[Whiteboard] Failed to finalize master script:", error);
    return { success: false, error: error.message };
  }

  const { data: project } = await supabase
    .from("video_projects")
    .select("target_duration")
    .eq("id", projectId)
    .single();

  const { isLongForm } = resolveDurationProfile(project?.target_duration as string | null);
  const warnings: string[] = [];

  if (isLongForm) {
    // One file per Act. A synthesis failure now costs a single ~2.5 minute Act instead
    // of the whole 25 minutes, and each Act's Deepgram alignment restarts its own word
    // cursor, so a mis-transcribed number can no longer shift every later scene.
    for (const act of acts) {
      const result = await generateActNarration(projectId, act.actNumber);
      warnings.push(...result.warnings);
      if (!result.success && result.error) {
        warnings.push(`Act ${act.actNumber}: ${result.error}`);
      }
    }

    const layout = await recomputeActLayout(projectId);
    warnings.push(...layout.warnings);
    if (layout.error) warnings.push(layout.error);

    await supabase.from("video_projects").update({ status: "narrated" }).eq("id", projectId);

    return { success: true, warnings };
  }

  // Short/mid-form is single-pass: ~8 scenes, so neither the drift nor the
  // re-record cost that motivated per-Act narration applies.
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, voice_over_beat")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: true });

  if (scenes && scenes.length > 0) {
    const audioRes = await generateFullNarration(projectId, scenes);
    if (!audioRes.success) {
      console.warn("[Whiteboard] Narration generation failed during finalize:", audioRes.error);
      warnings.push(`Narration failed: ${audioRes.error}`);
    }
  }

  await supabase.from("video_projects").update({ status: "narrated" }).eq("id", projectId);

  return { success: true, warnings };
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

export interface RegenerateActVisualsResult {
  success: boolean;
  scenes?: GeneratedActScene[];
  warnings: string[];
  error?: string;
}

/**
 * Regenerates ONE act's visuals — agents 3-7 only — without touching agent 1 (Script
 * Writer) or agent 2 (Scene Slicer).
 *
 * This is deliberately not "regenerate the act" in the sense of running it through the
 * full pipeline again: it reads each scene's CURRENT `voice_over_beat`, which is
 * whatever is in the database right now — the AI's original text if untouched, or the
 * user's hand edit from `updateSceneVoiceover` if they changed it. Re-running the
 * Script Writer would silently discard that edit the moment "regenerate" was clicked,
 * which is the opposite of what an edit-then-regenerate workflow is for.
 *
 * No new scene rows are created and none are deleted — every scene keeps its id,
 * sequence_number and act_number, and only the enrichment-derived columns
 * (final_video_prompt, scene_type, environment, lighting, camera_direction) are
 * overwritten in place. That is also why this needs no `startingSequenceNumber`
 * bookkeeping the way `generateAct` does.
 */
export async function regenerateActVisuals(params: {
  projectId: string;
  actNumber: number;
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
}): Promise<RegenerateActVisualsResult> {
  const { projectId, actNumber, topic, visualAesthetic, nicheTheme } = params;
  const supabase = await createClient();

  const { data: rows, error: fetchError } = await supabase
    .from("scenes")
    .select(
      "id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt, custom_media_type"
    )
    .eq("project_id", projectId)
    .eq("act_number", actNumber)
    .order("sequence_number");

  if (fetchError) {
    // act_number itself needs db/add-act-persistence.sql — without it there is no way
    // to tell which scenes belong to this act, so this feature cannot degrade
    // gracefully the way reads elsewhere do. Fail loudly instead of silently
    // regenerating the wrong (or every) scene.
    return {
      success: false,
      warnings: [],
      error: `Could not read this act's scenes (${fetchError.message}). Run db/add-act-persistence.sql if you haven't yet.`,
    };
  }

  if (!rows || rows.length === 0) {
    return { success: false, warnings: [], error: "This act has no scenes to regenerate." };
  }

  const sceneIds = rows.map((r) => r.id as string);

  // Reconstructed to match SlicedScene's shape so it can go straight into
  // enrichAndPersistScenes, which was written to consume the Slicer's own output. The
  // current final_video_prompt doubles as the fallback prompt: if enrichment fails
  // this time too, the scene keeps what it already had instead of losing its prompt.
  const slicedScenes: SlicedScene[] = rows.map((row, index) => ({
    sceneNumber: index + 1,
    voiceOverText: (row.voice_over_beat as string) ?? "",
    visualPrompt: (row.final_video_prompt as string) ?? "",
    estimatedDurationSeconds: Number(row.video_duration ?? 5),
    sceneType: ((row.scene_type as string) || "ESTABLISH") as SlicedScene["sceneType"],
    mediaType: ((row.custom_media_type as string) === "image" ? "image" : "video") as SlicedScene["mediaType"],
  }));

  const enrichment = await enrichAndPersistScenes({
    projectId,
    sceneIds,
    slicedScenes,
    topic,
    visualAesthetic,
    nicheTheme,
  });

  if (!enrichment.success) {
    return {
      success: false,
      warnings: enrichment.warnings,
      error: enrichment.error ?? "Visual regeneration failed.",
    };
  }

  // Read back so the Whiteboard shows what is actually stored, matching the pattern
  // generateAct already uses rather than trusting the in-memory enrichment result.
  const { data: updatedRows } = await supabase
    .from("scenes")
    .select("id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt")
    .in("id", sceneIds)
    .order("sequence_number");

  const scenes: GeneratedActScene[] = (updatedRows ?? []).map((row, index) => ({
    id: row.id as string,
    sequenceNumber: row.sequence_number as number,
    voiceOverText: (row.voice_over_beat as string) ?? "",
    sceneType: (row.scene_type as string) ?? "",
    estimatedDurationSeconds: Number(row.video_duration ?? 0),
    finalVideoPrompt: (row.final_video_prompt as string) ?? "",
    usedFallback: (row.final_video_prompt as string) === slicedScenes[index]?.visualPrompt,
  }));

  return { success: true, scenes, warnings: enrichment.warnings };
}

/* -------------------------------------------------------------------------- */
/*                    Per-Act narration re-record (post-approval)              */
/* -------------------------------------------------------------------------- */

export interface RegenerateActNarrationResult {
  success: boolean;
  /** The full act layout after the ripple, so the editor can reposition blocks. */
  acts?: ActNarration[];
  /** Seconds this act grew (positive) or shrank (negative). */
  shiftSeconds?: number;
  totalDurationSeconds?: number;
  warnings: string[];
  error?: string;
}

/**
 * Re-records ONE act's narration from whatever wording is currently stored.
 *
 * Mirrors `regenerateActVisuals`: it reads each scene's CURRENT `voice_over_beat` —
 * the user's hand edit if they made one — and never re-runs the Script Writer, which
 * would silently discard that edit the moment "regenerate" was clicked.
 *
 * No other act is re-synthesised, re-transcribed, or even read. Acts after this one
 * keep their own audio and their own internal scene durations; only their start offset
 * moves, which `recomputeActLayout` derives arithmetically. That ripple is intentional:
 * forcing a longer act back into its old slot would mean cutting off the new words.
 */
export async function regenerateActNarration(params: {
  projectId: string;
  actNumber: number;
  voiceId?: string;
}): Promise<RegenerateActNarrationResult> {
  const { projectId, actNumber, voiceId } = params;

  const before = await getActNarrations(projectId);
  const previousDuration =
    before.find((act) => act.actNumber === actNumber)?.durationSeconds ?? 0;

  const result = await generateActNarration(projectId, actNumber, voiceId);
  if (!result.success) {
    return { success: false, warnings: result.warnings, error: result.error };
  }

  const layout = await recomputeActLayout(projectId);
  const warnings = [...result.warnings, ...layout.warnings];
  if (layout.error) warnings.push(layout.error);

  const newDuration =
    layout.acts.find((act) => act.actNumber === actNumber)?.durationSeconds ?? 0;
  const shiftSeconds = Number((newDuration - previousDuration).toFixed(2));

  // Overlay clips and dragged-in music sit at fixed timestamps and do not ripple, so
  // say how far things moved rather than silently relocating the user's work.
  if (Math.abs(shiftSeconds) >= 0.5) {
    warnings.push(
      `Act ${actNumber} is now ${shiftSeconds > 0 ? "longer" : "shorter"} by ${Math.abs(shiftSeconds).toFixed(1)}s. Later acts moved accordingly — any music or overlay clips placed after this act may need re-aligning.`
    );
  }

  return {
    success: true,
    acts: layout.acts,
    shiftSeconds,
    totalDurationSeconds: layout.totalDurationSeconds,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*                    Approval gate — the visual pass (agents 3-7)             */
/* -------------------------------------------------------------------------- */

export interface ApproveResult {
  success: boolean;
  sceneCount?: number;
  blueprintCount?: number;
  warnings: string[];
  error?: string;
}

/**
 * The Approve button — runs the visual half of the pipeline over the whole project.
 *
 * Two things make this different from calling `enrichAndPersistScenes` per Act, which
 * is what `generateAct` used to do:
 *
 * 1. It runs on FINAL text. Every scene's `voice_over_beat` is whatever the user
 *    settled on after listening to the narration, so no prompt is built from wording
 *    that is about to change.
 *
 * 2. The Casting Director runs ONCE, over every scene in every act. Its contract says
 *    it is "the only agent that needs to see every scene at once" so a character cannot
 *    be restyled "between scene 1 and scene 40" — but per-Act calls gave it a ~17-scene
 *    window, so a 9-act video re-cast its cast nine times and the same character
 *    visibly changed between chapters. One shared blueprint set fixes that.
 */
export async function approveAndGenerateVisuals(params: {
  projectId: string;
  topic: string;
  visualAesthetic: string;
  /** Optional — resolved from the owning workspace when the caller has no handle on it. */
  nicheTheme?: string;
}): Promise<ApproveResult> {
  const { projectId, topic, visualAesthetic } = params;
  const supabase = await createClient();
  const warnings: string[] = [];

  // The Timeline Editor has no workspace theme prop, and threading one through a
  // 7,000-line component to reach an action that can already join to it would be the
  // wrong trade. The niche drives prompt styling, so losing it silently would quietly
  // flatten the look of every scene.
  let nicheTheme = params.nicheTheme;
  if (!nicheTheme) {
    const { data: joined } = await supabase
      .from("video_projects")
      .select("workspaces(content_theme)")
      .eq("id", projectId)
      .single();

    const workspace = joined?.workspaces as { content_theme?: string } | { content_theme?: string }[] | null;
    nicheTheme = Array.isArray(workspace)
      ? workspace[0]?.content_theme
      : workspace?.content_theme;
  }

  const { data: rows, error: fetchError } = await supabase
    .from("scenes")
    .select("id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt, custom_media_type")
    .eq("project_id", projectId)
    .order("sequence_number");

  if (fetchError) {
    return { success: false, warnings, error: `Could not read scenes: ${fetchError.message}` };
  }

  if (!rows || rows.length === 0) {
    return { success: false, warnings, error: "This project has no scenes to work from." };
  }

  const aesthetic = visualAesthetic || "Cinematic";

  // --- Agent 3, once, across every act -------------------------------------------
  const casting = await castCharacters({
    sceneTexts: rows.map((row) => (row.voice_over_beat as string) ?? ""),
    topic,
    visualAesthetic: aesthetic,
    nicheTheme,
  });

  const blueprints = casting.blueprints ?? {};

  if (!casting.success) {
    warnings.push(
      `Casting Director failed (${casting.error}). Characters may drift between scenes.`
    );
  }

  // Reshaped to SlicedScene so it can go straight into enrichAndPersistScenes, which
  // was written to consume the Slicer's output. The current prompt doubles as the
  // fallback: if enrichment fails, a scene keeps what it already had.
  const slicedScenes: SlicedScene[] = rows.map((row, index) => ({
    sceneNumber: index + 1,
    voiceOverText: (row.voice_over_beat as string) ?? "",
    visualPrompt: (row.final_video_prompt as string) ?? "",
    estimatedDurationSeconds: Number(row.video_duration ?? 5),
    sceneType: ((row.scene_type as string) || "ESTABLISH") as SlicedScene["sceneType"],
    mediaType: ((row.custom_media_type as string) === "image" ? "image" : "video") as SlicedScene["mediaType"],
  }));

  const enrichment = await enrichAndPersistScenes({
    projectId,
    sceneIds: rows.map((row) => row.id as string),
    slicedScenes,
    topic,
    visualAesthetic: aesthetic,
    nicheTheme,
    blueprints,
  });

  warnings.push(...enrichment.warnings);

  if (!enrichment.success) {
    return {
      success: false,
      warnings,
      error: enrichment.error ?? "Visual generation failed.",
    };
  }

  const { error: statusError } = await supabase
    .from("video_projects")
    .update({ status: "approved" })
    .eq("id", projectId);

  if (statusError) {
    warnings.push(`Project status not updated: ${statusError.message}`);
  }

  return {
    success: true,
    sceneCount: rows.length,
    blueprintCount: Object.keys(blueprints).length,
    warnings,
  };
}
