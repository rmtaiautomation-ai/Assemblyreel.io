"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript, generateActOutlines } from "@/lib/ai/script-writer";
import { sliceScriptIntoScenes } from "@/app/actions/slicer-actions";
import { enrichAndPersistScenes } from "@/app/actions/orchestrator-actions";
import { resolveDurationProfile } from "@/lib/ai/generation-rules";
import { type FormatProfile } from "@/lib/ai/format-profile";
import { factsNamedIn } from "@/lib/ai/channel-facts";
import {
  getWorkspaceFormatProfile,
  readActContinuity,
  recordActContinuity,
  resolveProjectFormatProfile,
  resolveProjectFramingDevice,
} from "@/app/actions/format-actions";
import { resolveProjectFactLedger } from "@/app/actions/fact-actions";
import {
  generateActNarration,
  generateFullNarration,
  getActNarrations,
  recomputeActLayout,
  type ActNarration,
} from "./audio-actions";
import { castCharacters, type CharacterBlueprints } from "@/lib/ai/agents/casting-director";
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

  // Resolved ONCE, here, and frozen onto the project below. Every later Act — even one
  // generated in a separate request after the user has edited the Channel Format tab —
  // reads this same snapshot via resolveProjectFormatProfile, never the live workspace
  // row. That is what keeps a whole video sounding like one channel.
  const { profile: formatProfile } = await getWorkspaceFormatProfile(workspaceId);

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
      targetDuration,
      formatProfile
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

  // Separate call, and best-effort: these columns need db/add-channel-blueprint.sql,
  // which is a different (and possibly not-yet-run) migration from the one above. A
  // missing snapshot column must not fail act_outlines/target_duration, so this cannot
  // share that update. Every later read of this project's format falls back to a live
  // workspace resolve when this write did not happen — see resolveProjectFormatProfile.
  if (formatProfile) {
    const { error: snapshotError } = await supabase
      .from("video_projects")
      .update({
        format_blueprint_snapshot: formatProfile,
        format_blueprint_version: formatProfile.version,
      })
      .eq("id", project.id);

    if (snapshotError) {
      console.warn(
        "[Whiteboard] format_blueprint_snapshot not saved — run db/add-channel-blueprint.sql:",
        snapshotError.message
      );
    }
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
  /**
   * Resolved format spec, when the caller already has one (e.g. right after
   * `createProjectWithActs`). Omitted callers get the project's frozen snapshot via
   * `resolveProjectFormatProfile` below — the same guarantee whether this Act is
   * generated inline during project creation or later, from a separate request, after
   * the Whiteboard's per-Act approval gate has already passed on earlier Acts.
   */
  formatProfile?: FormatProfile;
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

  // Created here rather than where scenes are first written below, so the format
  // profile — needed before Agent 1 even runs — and the scene writes later can share
  // one client instead of two.
  const supabase = await createClient();
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId, params.formatProfile);

  // Rotation ledger (Phase 7): ONE device for the whole video, drawn on the first Act and
  // reused by every later one. This used to call `consumeRotationCursor` directly, which
  // advances the channel cursor on every call — so a 9-Act video drew nine devices from a
  // 7-entry pool and re-framed itself three times over. `resolveProjectFramingDevice` is
  // idempotent per project and degrades to null on every failure path (no pool, migration
  // not run, project missing), in which case selectedFramingDevice stays undefined and the
  // Script Writer prompt falls back to its pre-Phase-7 "choose one from the pool"
  // instruction.
  const selectedFramingDevice =
    (await resolveProjectFramingDevice(projectId, formatProfile)) ?? undefined;

  // The closed set of named sources this Act may cite. Frozen onto the project on first
  // call, for the same reason the format profile is: with a human approval gate between
  // Acts, a fact ticked or unticked mid-video must not change what a later Act is allowed
  // to say. Returns [] rather than throwing on any failure — including a database that has
  // not run db/add-channel-facts.sql — and an empty ledger compiles to no instruction at
  // all, which is exactly the behaviour before this existed.
  const facts = await resolveProjectFactLedger(supabase, projectId);

  // What earlier Acts of THIS video already spent. The arcBeats reserve list tells this Act
  // which beats belong elsewhere, but says nothing about what has already been said — which
  // is why the Council of Laodicea landed in both Act 7 and Act 8 of two separate videos.
  // Empty for Act 1 and for an un-migrated database, in which case no block is emitted.
  const continuity = act ? await readActContinuity(supabase, projectId) : [];

  // --- Agent 1: Script Writer ----------------------------------------------------
  //
  // scriptHook is a cold-open line, written once at project creation for the video's
  // OPENING five seconds. Every act used to receive it verbatim regardless of act
  // number — so Act 7 was handed "Hook: [Act 1's opening image]" alongside a system
  // instruction telling it every Act carries its own self-contained cold open. Same
  // call, two contradictory instructions about how this act should begin.
  //
  // Scoped to the act that actually owns the cold open: Act 1 of a multi-act video, or
  // the single generation call for a short/mid-form video (no `act` at all — the whole
  // script IS the opening in that case, so the hook still belongs in every word of it).
  const hookAppliesHere = !act || act.actNumber === 1;

  const scriptResult = await generateScript({
    topic,
    narrativeArc,
    hook: hookAppliesHere ? scriptHook : "",
    visualAesthetic: aesthetic,
    pov: "Third-person omnipresent",
    nicheTheme: workspaceTheme,
    targetDuration,
    formatProfile,
    selectedFramingDevice,
    facts,
    continuity,
    ...(act ? { actOutline: { actNumber: act.actNumber, description: act.description } } : {}),
  });

  if (!scriptResult.success || !scriptResult.scriptLines) {
    return { success: false, warnings, error: scriptResult.error || "Script generation failed." };
  }

  const scriptLines = scriptResult.scriptLines;
  const actScriptText = scriptLines.join("\n\n");

  // Record what this Act actually named, for the Acts that follow. Written from the
  // generated narration rather than from what the prompt asked for, because the two differ
  // — the point is what the viewer was really told. Single-pass short/mid-form has no later
  // Act to inform, so it is skipped entirely.
  if (act) {
    await recordActContinuity(supabase, projectId, {
      actNumber: act.actNumber,
      title: act.title,
      namedFacts: factsNamedIn(actScriptText, facts),
    });
  }

  // --- Agent 2: Scene Slicer -----------------------------------------------------
  const slicerResult = await sliceScriptIntoScenes({
    projectId,
    fullScript: actScriptText,
    startingSequenceNumber,
    nicheTheme: workspaceTheme,
    targetDuration,
    formatProfile,
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
 * Regenerates one already-written Act against the channel's CURRENT format settings —
 * for testing a blueprint change without starting a new project. `generateAct` always
 * inserts a fresh set of scenes and has no notion of an Act that already has some; it
 * is the right tool while building a video top to bottom, but calling it a second time
 * on the same Act number would leave the old scenes in place and add a duplicate set
 * beside them.
 *
 * The old scenes are captured before regenerating and deleted only after the new ones
 * exist — so a failed or rate-limited rewrite (LLM error, quota) leaves the Act exactly
 * as it was, never half-replaced. Narration audio and rendered visuals are left alone,
 * same policy as `replaceActScenes`: this only replaces script and prompt text, and the
 * existing Re-record / Regenerate Visuals buttons pick up the new wording from here.
 */
export async function rewriteActWithAI(
  params: Parameters<typeof generateAct>[0]
): Promise<GenerateActResult> {
  const { projectId, actNumber } = params;
  const supabase = await createClient();

  const { data: oldScenes, error: oldScenesError } = await supabase
    .from("scenes")
    .select("id")
    .eq("project_id", projectId)
    .eq("act_number", actNumber);

  if (oldScenesError) {
    return {
      success: false,
      warnings: [],
      error: `Could not read this act's existing scenes (${oldScenesError.message}).`,
    };
  }

  const oldSceneIds = (oldScenes ?? []).map((row) => row.id as string);

  // Past the end of every existing scene in the project, not just this act's own prior
  // count — unlike a fresh "Write this act" walking acts in order, a rewrite can run at
  // any time, with later acts already holding scenes whose numbers must not collide.
  const { data: maxRow } = await supabase
    .from("scenes")
    .select("sequence_number")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startingSequenceNumber = (Number(maxRow?.sequence_number) || 0) + 1;

  const result = await generateAct({ ...params, startingSequenceNumber });
  if (!result.success) {
    // Nothing was deleted yet — the act is untouched, exactly as if this were never
    // called.
    return result;
  }

  if (oldSceneIds.length > 0) {
    const { error: deleteError } = await supabase.from("scenes").delete().in("id", oldSceneIds);
    if (deleteError) {
      console.error("[Whiteboard] Rewrite succeeded, but clearing the old scenes failed:", deleteError);
      result.warnings.push(
        `The act was rewritten, but its old scenes could not be removed (${deleteError.message}). Both versions are now on the board — delete the stale ones by hand.`
      );
      return result;
    }
  }

  const { data: allScenes, error: fetchError } = await supabase
    .from("scenes")
    .select("id, sequence_number")
    .eq("project_id", projectId)
    .order("act_number", { ascending: true })
    .order("sequence_number", { ascending: true });

  if (fetchError) {
    result.warnings.push(
      `The act was rewritten, but reordering the project failed (${fetchError.message}). Reload before rewriting again.`
    );
    return result;
  }

  const renumbered = (allScenes ?? [])
    .map((row, index) => ({ id: row.id as string, sequence_number: index + 1 }))
    .filter((row, index) => row.sequence_number !== (allScenes ?? [])[index].sequence_number);

  if (renumbered.length > 0) {
    const results = await Promise.all(
      renumbered.map((row) =>
        supabase.from("scenes").update({ sequence_number: row.sequence_number }).eq("id", row.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      result.warnings.push(
        `The act was rewritten, but reordering the project failed (${failed.error.message}). Reload before rewriting again.`
      );
    }
  }

  return result;
}

/**
 * Step 3 — stitch the approved Act scripts into the project's master script and hand
 * off from the Whiteboard to the Timeline Editor.
 *
 * Called once after every Act has generated, so a partially generated project never
 * overwrites a good master script with a truncated one.
 *
 * Long-form's only remaining job here is casting the characters ONCE, before any Act
 * has audio or visuals — see `castProjectCharactersOnce`. It no longer narrates
 * anything: audio and visual approval are driven per-Act from the Timeline Editor from
 * this point on, in whatever order the user chooses, via `generateActNarration` and
 * `approveActVisuals`. The project lands on `scripted`, not `narrated` — see
 * `PROJECT_STATUSES` in timeline-types.ts for why that status no longer means "every
 * Act narrated."
 *
 * Short/mid-form is untouched: single-pass, still narrates immediately here and lands
 * on `narrated`.
 */
export async function finalizeProjectScript(params: {
  projectId: string;
  acts: Array<{ actNumber: number; title: string; scriptLines: string[] }>;
  topic?: string;
  visualAesthetic?: string;
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
    .select("target_duration, topic, visual_aesthetic")
    .eq("id", projectId)
    .single();

  const { isLongForm } = resolveDurationProfile(project?.target_duration as string | null);
  const warnings: string[] = [];

  if (isLongForm) {
    // Casting happens ONCE here, before any Act has audio or visuals, so whichever
    // Act the user approves first draws from the same cast as every other. This
    // replaces the old narrate-every-Act loop that used to live in this branch: audio
    // and visual approval are now per-Act, driven from the Timeline Editor, instead of
    // one click recording all 9 Acts with no pause.
    const cast = await castProjectCharactersOnce({
      projectId,
      topic: params.topic ?? (project?.topic as string) ?? "",
      visualAesthetic: params.visualAesthetic ?? (project?.visual_aesthetic as string) ?? "Cinematic",
    });

    if (cast.error) warnings.push(cast.error);
    if (!cast.success) {
      warnings.push("Casting Director failed. Characters may drift between Acts when visuals are approved.");
    }

    await supabase.from("video_projects").update({ status: "scripted" }).eq("id", projectId);

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

/**
 * Overwrites one Act's scenes wholesale — the reverse of the act-header Copy button.
 * Lets the user round-trip an Act through an external LLM (rewrite the voice, fix a
 * fact, tighten a line) and paste the result straight back in, without touching any
 * other Act.
 *
 * Scene count is allowed to change — the paste may add or drop a scene — so every
 * scene in the project is renumbered afterward to stay globally contiguous across
 * Acts. Only the script and prompt text move; narration audio and rendered media are
 * left alone, same as a single-scene edit, so the existing Re-record and Regenerate
 * Visuals buttons pick up the new wording from here. Each pasted scene gets a
 * word-count duration estimate so the Timeline's scrubber has real boundaries to walk
 * immediately — Re-record still overwrites it with the actual measured timing.
 */
export async function replaceActScenes(
  projectId: string,
  actNumber: number,
  scenes: Array<{ voiceOverText: string; visualPrompt: string }>
): Promise<{ success: boolean; sceneCount?: number; error?: string }> {
  if (!projectId || !actNumber) {
    return { success: false, error: "Missing projectId or actNumber" };
  }
  if (!scenes || scenes.length === 0) {
    return { success: false, error: "No scenes found in the pasted text" };
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("scenes")
    .delete()
    .eq("project_id", projectId)
    .eq("act_number", actNumber);

  if (deleteError) {
    console.error("[Whiteboard] Failed to clear the act's old scenes:", deleteError);
    return { success: false, error: deleteError.message };
  }

  // A rough duration estimate from word count — the same method the Scene Slicer
  // itself uses before real audio exists. Left unset (0), a pasted scene has no
  // timing at all until the next Re-record, and the Timeline's scrubber and its
  // "currently speaking" highlight walk scene boundaries by summing this column — so
  // an unset one races through every scene instantly while whatever audio is playing
  // (old or none) carries on at its own pace. This estimate closes that gap; Re-record
  // still overwrites it with the real, measured duration once it runs.
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId);
  const wordsPerSecond = formatProfile.delivery.wordsPerMinute / 60;

  // Sequenced past nothing in particular yet — only these rows' order relative to each
  // other matters here. The renumbering pass below fixes the whole project into one
  // contiguous order, so a moment of collision with another Act's existing numbers
  // (no unique constraint on this column) is harmless.
  const toInsert = scenes.map((scene, index) => ({
    project_id: projectId,
    act_number: actNumber,
    sequence_number: index + 1,
    voice_over_beat: scene.voiceOverText,
    final_video_prompt: scene.visualPrompt,
    video_duration: Number(
      Math.max(0.5, scene.voiceOverText.trim().split(/\s+/).filter(Boolean).length / wordsPerSecond).toFixed(2)
    ),
    generation_status: "Pending",
  }));

  const { error: insertError } = await supabase.from("scenes").insert(toInsert);
  if (insertError) {
    console.error("[Whiteboard] Failed to insert the pasted scenes:", insertError);
    return { success: false, error: insertError.message };
  }

  const { data: allScenes, error: fetchError } = await supabase
    .from("scenes")
    .select("id, sequence_number")
    .eq("project_id", projectId)
    .order("act_number", { ascending: true })
    .order("sequence_number", { ascending: true });

  if (fetchError) {
    // The paste itself succeeded; only the global renumbering pass failed. Surfaced
    // distinctly so the caller tells the user to reload rather than paste again, which
    // would duplicate the scenes just inserted.
    console.error("[Whiteboard] Pasted scenes saved, but renumbering failed:", fetchError);
    return {
      success: false,
      error: `Scenes were saved, but reordering the project failed (${fetchError.message}). Reload before pasting again.`,
    };
  }

  const renumbered = (allScenes ?? [])
    .map((row, index) => ({ id: row.id as string, sequence_number: index + 1 }))
    .filter((row, index) => row.sequence_number !== (allScenes ?? [])[index].sequence_number);

  if (renumbered.length > 0) {
    const results = await Promise.all(
      renumbered.map((row) =>
        supabase.from("scenes").update({ sequence_number: row.sequence_number }).eq("id", row.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[Whiteboard] Pasted scenes saved, but renumbering failed:", failed.error);
      return {
        success: false,
        error: `Scenes were saved, but reordering the project failed (${failed.error.message}). Reload before pasting again.`,
      };
    }
  }

  return { success: true, sceneCount: scenes.length };
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
  /** Optional — resolved from the owning workspace when the caller has no handle on it. */
  nicheTheme?: string;
  /** Optional — resolved from the project's frozen snapshot when the caller has none. */
  formatProfile?: FormatProfile;
}): Promise<RegenerateActVisualsResult> {
  const { projectId, actNumber, topic, visualAesthetic } = params;
  const supabase = await createClient();

  // Same reasoning as `approveActVisuals`: visuals must be built against this Act's
  // real narrated timing. A regenerate reaching here without narration would mean
  // something bypassed the normal approve-then-regenerate path.
  const { data: narrationRow, error: narrationCheckError } = await supabase
    .from("act_narrations")
    .select("act_number")
    .eq("project_id", projectId)
    .eq("act_number", actNumber)
    .maybeSingle();

  if (narrationCheckError) {
    return {
      success: false,
      warnings: [],
      error: `Could not verify Act ${actNumber}'s narration status (${narrationCheckError.message}).`,
    };
  }
  if (!narrationRow) {
    return {
      success: false,
      warnings: [],
      error: `Narrate Act ${actNumber} before generating its visuals — visuals need the real, aligned timing from that act's audio.`,
    };
  }

  // The Timeline Editor (this function's other caller, alongside the Whiteboard) has
  // no workspace theme prop — same reasoning as `approveActVisuals`.
  const nicheTheme = await resolveWorkspaceNicheTheme(supabase, projectId, params.nicheTheme);
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId, params.formatProfile);

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

  // Reuses the project's ONE cast instead of casting fresh for this act alone — that
  // was the exact bug this whole restructuring exists to fix: a per-act Casting
  // Director call only ever saw that act's ~17 scenes, so the same character could be
  // re-cast differently every time an act's visuals were (re)generated.
  const cast = await castProjectCharactersOnce({ projectId, topic, visualAesthetic, nicheTheme, formatProfile });

  const enrichment = await enrichAndPersistScenes({
    projectId,
    sceneIds,
    slicedScenes,
    topic,
    visualAesthetic,
    nicheTheme,
    formatProfile,
    blueprints: cast.blueprints,
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
  /**
   * This act's newly-aligned per-scene durations. The caller's local `scenes`
   * state won't otherwise learn about them — see `GenerateActNarrationResult.updatedScenes`.
   */
  updatedScenes?: Array<{ id: string; video_duration: number }>;
  warnings: string[];
  error?: string;
}

/**
 * Records — or re-records — ONE act's narration from whatever wording is currently
 * stored. The same call serves two UI moments: generating an Act's audio for the
 * first time (from an empty placeholder block, before any narration exists for it)
 * and re-recording an Act that already has audio. Both read each scene's CURRENT
 * `voice_over_beat` — the user's hand edit if they made one — and never re-run the
 * Script Writer, which would silently discard that edit the moment the button was
 * clicked.
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
  const existingBefore = before.find((act) => act.actNumber === actNumber);
  const previousDuration = existingBefore?.durationSeconds ?? 0;

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
  // say how far things moved rather than silently relocating the user's work. Skipped
  // on a first-time recording (`existingBefore` absent) — there is no previous state
  // to have "shifted" from, so the message would read as a non-sequitur.
  if (existingBefore && Math.abs(shiftSeconds) >= 0.5) {
    warnings.push(
      `Act ${actNumber} is now ${shiftSeconds > 0 ? "longer" : "shorter"} by ${Math.abs(shiftSeconds).toFixed(1)}s. Later acts moved accordingly — any music or overlay clips placed after this act may need re-aligning.`
    );
  }

  return {
    success: true,
    acts: layout.acts,
    shiftSeconds,
    totalDurationSeconds: layout.totalDurationSeconds,
    updatedScenes: result.updatedScenes,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*                    Approval gate — the visual pass (agents 3-7)             */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the workspace niche when a caller has no direct handle on it.
 *
 * Extracted from `approveAndGenerateVisuals`, which needed this because the Timeline
 * Editor has no workspace theme prop and threading one through a 7,000-line component
 * to reach an action that can already join to it would be the wrong trade. Now shared
 * with `castProjectCharactersOnce`, which needs the same resolution for the same
 * reason — the niche drives prompt styling, so losing it silently would quietly
 * flatten the look of every scene.
 */
async function resolveWorkspaceNicheTheme(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  provided?: string
): Promise<string | undefined> {
  if (provided) return provided;

  const { data: joined } = await supabase
    .from("video_projects")
    .select("workspaces(content_theme)")
    .eq("id", projectId)
    .single();

  const workspace = joined?.workspaces as { content_theme?: string } | { content_theme?: string }[] | null;
  return Array.isArray(workspace) ? workspace[0]?.content_theme : workspace?.content_theme;
}

export interface CastProjectResult {
  success: boolean;
  blueprints: CharacterBlueprints;
  /** True when this call actually ran the Casting Director; false when it read an existing cast. */
  didCast: boolean;
  error?: string;
}

/**
 * Casts the whole project's characters exactly once, and lets every later caller reuse
 * that same cast instead of recomputing it.
 *
 * This is the fix for a real bug: the Casting Director documents itself as "the only
 * agent that needs to see every scene at once" so a character cannot be restyled
 * "between scene 1 and scene 40" — but it used to be invoked once per Act (inside
 * `generateAct`, and again inside `regenerateActVisuals`), each time seeing only that
 * Act's ~17 scenes with no memory of the others. A 9-Act video re-cast its cast nine
 * times, and the same character visibly changed appearance between chapters.
 *
 * Self-healing by construction rather than gated behind a separate "has casting run"
 * flag: `video_projects.character_blueprints` (jsonb, no default — so `null` until
 * something writes it) IS the flag. Calling this before every Act's script exists, or
 * calling it twice, still produces exactly one consistent cast either way.
 */
export async function castProjectCharactersOnce(params: {
  projectId: string;
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
  formatProfile?: FormatProfile;
}): Promise<CastProjectResult> {
  const { projectId, topic, visualAesthetic } = params;
  const supabase = await createClient();

  const { data: project, error: readError } = await supabase
    .from("video_projects")
    .select("character_blueprints")
    .eq("id", projectId)
    .single();

  if (readError) {
    return { success: false, blueprints: {}, didCast: false, error: readError.message };
  }

  const existing = project?.character_blueprints as CharacterBlueprints | null;
  if (existing) {
    return { success: true, blueprints: existing, didCast: false };
  }

  const nicheTheme = await resolveWorkspaceNicheTheme(supabase, projectId, params.nicheTheme);
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId, params.formatProfile);

  const { data: rows, error: scenesError } = await supabase
    .from("scenes")
    .select("voice_over_beat")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: true });

  if (scenesError) {
    return { success: false, blueprints: {}, didCast: false, error: scenesError.message };
  }

  const casting = await castCharacters({
    sceneTexts: (rows ?? []).map((row) => (row.voice_over_beat as string) ?? ""),
    topic,
    visualAesthetic: visualAesthetic || "Cinematic",
    nicheTheme,
    formatProfile,
  });

  const blueprints = casting.blueprints ?? {};

  const { error: writeError } = await supabase
    .from("video_projects")
    .update({ character_blueprints: blueprints })
    .eq("id", projectId);

  if (writeError) {
    // Not persisting means the next call would re-cast from scratch, which is
    // survivable — just report it rather than pretending the write happened.
    return {
      success: casting.success,
      blueprints,
      didCast: true,
      error: `Cast but could not save (${writeError.message}). Run db/add-agent-pipeline-columns.sql in the Supabase SQL editor.`,
    };
  }

  return {
    success: casting.success,
    blueprints,
    didCast: true,
    error: casting.success ? undefined : casting.error,
  };
}

export interface ApproveActResult {
  success: boolean;
  actNumber?: number;
  sceneCount?: number;
  /** True once every scene in the whole project — not just this act — has visuals. */
  projectFullyApproved?: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Approves ONE Act's visuals: agents 4-7 for that Act's scenes, drawing on the
 * project's single shared cast rather than casting fresh.
 *
 * This is the primitive the per-Act workflow is built on: generate Act 1's audio,
 * approve Act 1's visuals here, move to Act 2 — while Acts 2-9 have no audio or
 * visuals yet. `castProjectCharactersOnce` makes this order-independent: whichever Act
 * gets approved first, the cast behind it is the same one every other Act will draw
 * from, computed at most once for the whole project regardless of call order.
 *
 * Runs on FINAL text — whatever `voice_over_beat` currently holds, the user's hand
 * edit if they made one — so no prompt is ever built from wording about to change.
 */
export async function approveActVisuals(params: {
  projectId: string;
  actNumber: number;
  topic: string;
  visualAesthetic: string;
  /** Optional — resolved from the owning workspace when the caller has no handle on it. */
  nicheTheme?: string;
  /** Optional — resolved from the project's frozen snapshot when the caller has none. */
  formatProfile?: FormatProfile;
}): Promise<ApproveActResult> {
  const { projectId, actNumber, topic, visualAesthetic } = params;
  const supabase = await createClient();
  const warnings: string[] = [];

  // Visuals must be built against this Act's REAL narrated timing, not the Scene
  // Slicer's estimate — that estimate is what Deepgram alignment overwrites the
  // moment this Act is narrated, so generating visuals before that exists means
  // building against a duration that's about to change out from under them. This
  // was previously allowed "in any order" (see commit 48a810b), which is exactly
  // what produced visuals whose pacing no longer matched the real audio.
  const { data: narrationRow, error: narrationCheckError } = await supabase
    .from("act_narrations")
    .select("act_number")
    .eq("project_id", projectId)
    .eq("act_number", actNumber)
    .maybeSingle();

  if (narrationCheckError) {
    return {
      success: false,
      warnings,
      error: `Could not verify Act ${actNumber}'s narration status (${narrationCheckError.message}).`,
    };
  }
  if (!narrationRow) {
    return {
      success: false,
      warnings,
      error: `Narrate Act ${actNumber} before generating its visuals — visuals need the real, aligned timing from that act's audio.`,
    };
  }

  // The Timeline Editor has no workspace theme prop, and threading one through a
  // 7,000-line component to reach an action that can already join to it would be the
  // wrong trade. Resolved once here rather than left to `castProjectCharactersOnce`'s
  // own resolution, so the SAME niche (and format) reaches both casting and the
  // enrichment call below — otherwise an unsupplied value would silently diverge
  // between the two.
  const nicheTheme = await resolveWorkspaceNicheTheme(supabase, projectId, params.nicheTheme);
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId, params.formatProfile);

  const cast = await castProjectCharactersOnce({ projectId, topic, visualAesthetic, nicheTheme, formatProfile });
  if (cast.error) warnings.push(cast.error);

  const { data: rows, error: fetchError } = await supabase
    .from("scenes")
    .select(
      "id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt, custom_media_type"
    )
    .eq("project_id", projectId)
    .eq("act_number", actNumber)
    .order("sequence_number");

  if (fetchError) {
    return {
      success: false,
      warnings,
      error: `Could not read this act's scenes (${fetchError.message}). Run db/add-act-persistence.sql if you haven't yet.`,
    };
  }

  if (!rows || rows.length === 0) {
    return { success: false, warnings, error: `Act ${actNumber} has no scenes to approve.` };
  }

  const aesthetic = visualAesthetic || "Cinematic";

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
    formatProfile,
    blueprints: cast.blueprints,
  });

  warnings.push(...enrichment.warnings);

  if (!enrichment.success) {
    return {
      success: false,
      warnings,
      error: enrichment.error ?? "Visual generation failed.",
    };
  }

  // Whether the WHOLE project is done, not just this act — derived from scene state
  // rather than a separate counter, so it can never drift out of sync with what
  // actually happened. `environment` is written only by agents 4-7, never by the
  // Slicer (confirmed against slicer-actions.ts's insert payload), so `IS NULL` means
  // "visuals not approved yet" with no ambiguity against the slicer's raw prompt.
  //
  // Needs db/add-agent-pipeline-columns.sql; without it this under-reports and the
  // project simply never flips to 'approved' automatically here — re-running this
  // action or a manual status change still recovers it, so this degrades safely.
  const { count: unapprovedCount, error: countError } = await supabase
    .from("scenes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("environment", null);

  let projectFullyApproved = false;
  if (countError) {
    warnings.push(`Could not confirm whether every act is approved: ${countError.message}`);
  } else if ((unapprovedCount ?? 0) === 0) {
    projectFullyApproved = true;
    const { error: statusError } = await supabase
      .from("video_projects")
      .update({ status: "approved" })
      .eq("id", projectId);
    if (statusError) warnings.push(`Project status not updated: ${statusError.message}`);
  }

  return { success: true, actNumber, sceneCount: rows.length, projectFullyApproved, warnings };
}

export interface ApproveResult {
  success: boolean;
  sceneCount?: number;
  blueprintCount?: number;
  /**
   * Whether EVERY act in the project now has visuals. Not implied by `success`:
   * this action skips acts that have no narration yet, so a successful bulk run can
   * still leave the project unfinished. The caller needs the real answer to decide
   * whether to show the project as approved.
   */
  projectFullyApproved?: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Approves visuals for every Act that doesn't have them yet, in one call.
 *
 * Built on `approveActVisuals` — that per-Act primitive is the source of truth now;
 * this is a loop over it for whoever has finished reviewing every Act's audio and
 * wants the rest done in bulk instead of clicking through each Act individually.
 */
export async function approveAndGenerateVisuals(params: {
  projectId: string;
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
  formatProfile?: FormatProfile;
}): Promise<ApproveResult> {
  const { projectId, topic, visualAesthetic } = params;
  const supabase = await createClient();
  const warnings: string[] = [];

  const nicheTheme = await resolveWorkspaceNicheTheme(supabase, projectId, params.nicheTheme);
  const formatProfile = await resolveProjectFormatProfile(supabase, projectId, params.formatProfile);

  const { data: rows, error: fetchError } = await supabase
    .from("scenes")
    .select("act_number, environment")
    .eq("project_id", projectId);

  if (fetchError) {
    return { success: false, warnings, error: `Could not read scenes: ${fetchError.message}` };
  }

  if (!rows || rows.length === 0) {
    return { success: false, warnings, error: "This project has no scenes to work from." };
  }

  const unapprovedActs = Array.from(
    new Set(
      rows
        .filter((row) => row.environment == null)
        .map((row) => row.act_number as number)
    )
  ).sort((a, b) => a - b);

  // Only acts that already have narration are eligible — `approveActVisuals` now
  // refuses the rest, and letting the loop hit that refusal once per un-narrated act
  // would bury the real result in a wall of identical warnings. Skipped acts are
  // reported once, together, as a single actionable line instead.
  const { data: narratedRows, error: narratedError } = await supabase
    .from("act_narrations")
    .select("act_number")
    .eq("project_id", projectId);

  if (narratedError) {
    return {
      success: false,
      warnings,
      error: `Could not read which acts have narration: ${narratedError.message}`,
    };
  }

  const narratedActs = new Set((narratedRows ?? []).map((r) => r.act_number as number));
  const eligibleActs = unapprovedActs.filter((actNumber) => narratedActs.has(actNumber));
  const skippedActs = unapprovedActs.filter((actNumber) => !narratedActs.has(actNumber));

  if (skippedActs.length > 0) {
    warnings.push(
      `Skipped act${skippedActs.length === 1 ? '' : 's'} ${skippedActs.join(', ')} — narrate ${skippedActs.length === 1 ? 'it' : 'them'} first so visuals are timed against real audio.`
    );
  }

  if (eligibleActs.length === 0) {
    return {
      success: false,
      warnings,
      error: "No acts are ready for visuals yet — narrate at least one act first.",
    };
  }

  let sceneCount = 0;
  let projectFullyApproved = false;
  for (const actNumber of eligibleActs) {
    const result = await approveActVisuals({ projectId, actNumber, topic, visualAesthetic, nicheTheme, formatProfile });
    warnings.push(...result.warnings);
    if (!result.success && result.error) {
      warnings.push(`Act ${actNumber}: ${result.error}`);
      continue;
    }
    sceneCount += result.sceneCount ?? 0;
    // Each per-act call already derives this from scene state and flips the project
    // status when it's true, so the last act to complete carries the real answer.
    if (result.projectFullyApproved) projectFullyApproved = true;
  }

  const cast = await castProjectCharactersOnce({ projectId, topic, visualAesthetic, nicheTheme, formatProfile });
  if (cast.error) warnings.push(cast.error);

  return {
    success: true,
    sceneCount,
    blueprintCount: Object.keys(cast.blueprints).length,
    projectFullyApproved,
    warnings,
  };
}
