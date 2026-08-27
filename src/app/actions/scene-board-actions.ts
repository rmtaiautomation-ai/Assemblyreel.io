"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActOutline } from "@/app/actions/whiteboard-actions";
import type { CharacterBlueprint, CharacterBlueprints } from "@/lib/ai/agents/casting-director";

/**
 * Read model for the Scene Board route (implementation_plans/19-scene-board-workspace.md).
 *
 * Replaces `loadProjectForWhiteboard`, which answered only "which scenes belong to
 * which Act" — all the old accordion needed. This one answers "show me everything the
 * agent chain produced": the Visual Architect's environment and lighting, the Cinematic
 * Director's camera direction, the Casting Director's blueprints, each Act's recorded
 * narration, and each scene's media. Every one of those columns is already written by
 * the pipeline and, before this, was rendered nowhere in the app.
 *
 * Nothing here triggers generation or costs a provider call. It is pure read-back.
 */

/** One scene, with every agent's output attached. */
export interface SceneBoardScene {
  id: string;
  sequenceNumber: number;
  actNumber: number;
  /** Agent 1 (Script Writer) — the only field the board lets you edit. */
  voiceOverText: string;
  /** Agent 2 (Scene Slicer). */
  sceneType: string;
  durationSeconds: number;
  /** Agent 6 (Prompt Assembler) — the assembled prompt actually sent to the image model. */
  finalVideoPrompt: string;
  /** Agent 4 (Visual Architect). Null until this act's visuals are approved. */
  environment: string | null;
  /** Agent 4 (Visual Architect). */
  lighting: string | null;
  /** Agent 5 (Cinematic Director). */
  cameraDirection: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  generationStatus: string;
  /** Cast members whose name appears in this scene's narration or prompt. */
  castNames: string[];
}

/** Where one Act sits in the four-stage pipeline. Derived, never stored. */
export interface ActProgress {
  hasScript: boolean;
  hasAudio: boolean;
  hasVisuals: boolean;
  /** Every scene in the act has an assembled prompt — the act is fully approved. */
  isApproved: boolean;
}

export interface SceneBoardAct {
  outline: ActOutline;
  scenes: SceneBoardScene[];
  /** From `act_narrations`. Null when this act has not been recorded yet. */
  narration: {
    audioUrl: string;
    durationSeconds: number;
    startSeconds: number;
  } | null;
  progress: ActProgress;
}

export interface SceneBoardData {
  projectId: string;
  workspaceId: string;
  workspaceTheme: string;
  /**
   * The channel's saved `workspaces.narration_voice_id`, for a read-only display in the
   * Inspector — see `resolveNarrationSettings` in audio-actions.ts for where this is
   * actually applied at synthesis time. Empty string means "Auto" (Voice Studio's
   * active-engine default), matching the Channel tab's own convention.
   */
  narrationVoiceId: string;
  topic: string;
  narrativeArc: string;
  scriptHook: string;
  visualAesthetic: string;
  targetDuration: string;
  isSinglePass: boolean;
  acts: SceneBoardAct[];
  /** Agent 3 (Casting Director). Empty until the first act's visuals are approved. */
  cast: CharacterBlueprint[];
  /** Sum of every recorded act's real narration length, in seconds. */
  recordedSeconds: number;
  /** The runtime the chosen tier is aiming for, in seconds. Null for unknown tiers. */
  targetSeconds: { min: number; max: number } | null;
  /**
   * Non-fatal notes about columns or tables this project's database does not have yet
   * — the board still renders, it just cannot show that dimension.
   */
  warnings: string[];
}

/**
 * Seconds each `NewVideoForm` duration option is aiming for.
 *
 * Deliberately local to the board rather than added to `generation-rules.ts`:
 * `DurationProfile` describes what to *ask the model for* (word counts, act counts,
 * pacing), and nothing in the generation path needs a wall-clock target. This is a
 * presentation concern — the "24:31 / ~25:00" readout — so it lives with the surface
 * that shows it. Keys are byte-identical to the form's option values.
 */
const TARGET_SECONDS_BY_FORM_VALUE: Record<string, { min: number; max: number }> = {
  "Short (< 60s)": { min: 30, max: 60 },
  "Mid (2-3m)": { min: 120, max: 180 },
  "Mid (4-5m)": { min: 240, max: 300 },
  "Long (10-15m)": { min: 600, max: 900 },
  "Long (15-20m)": { min: 900, max: 1200 },
  "Long (20-25m)": { min: 1200, max: 1500 },
  "Long (25-30m)": { min: 1500, max: 1800 },
};

/**
 * Scene columns in descending order of richness.
 *
 * PostgREST rejects an entire `select()` when *any* named column is missing, so asking
 * for the agent columns on a database that has not run `add-agent-pipeline-columns.sql`
 * would return zero scenes rather than partial ones — the exact failure
 * the old loader documented hitting with `act_number`. Each tier
 * below drops the newest migration's columns, so the board degrades one capability at a
 * time instead of going blank.
 */
const SCENE_COLUMN_TIERS = [
  {
    columns:
      "id, sequence_number, act_number, voice_over_beat, scene_type, video_duration, final_video_prompt, environment, lighting, camera_direction, custom_media_url, custom_media_type, generation_status",
    missing: null,
  },
  {
    columns:
      "id, sequence_number, act_number, voice_over_beat, scene_type, video_duration, final_video_prompt, custom_media_url, custom_media_type, generation_status",
    missing:
      "Camera, lighting and environment are hidden — run db/add-agent-pipeline-columns.sql to see them.",
  },
  {
    columns:
      "id, sequence_number, voice_over_beat, scene_type, video_duration, final_video_prompt, custom_media_url, custom_media_type, generation_status",
    missing:
      "Every scene is grouped under Act 1 — run db/add-act-persistence.sql to restore act grouping.",
  },
] as const;

/** Matches a cast member to a scene by name mention. Cheap, and good enough to label a card. */
function castNamesInScene(
  cast: CharacterBlueprint[],
  voiceOverText: string,
  finalVideoPrompt: string
): string[] {
  if (cast.length === 0) return [];
  const haystack = `${voiceOverText} ${finalVideoPrompt}`.toLowerCase();
  return cast.filter((member) => haystack.includes(member.name.toLowerCase())).map((m) => m.name);
}

export async function loadSceneBoard(
  projectId: string
): Promise<{ success: boolean; data?: SceneBoardData; error?: string }> {
  const supabase = await createClient();
  const warnings: string[] = [];

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
    .select("content_theme, narration_voice_id")
    .eq("id", project.workspace_id)
    .single();

  /* ── Scenes, degrading one migration at a time ─────────────────────────────── */

  let sceneRows: Array<Record<string, unknown>> = [];

  for (const tier of SCENE_COLUMN_TIERS) {
    const { data, error } = await supabase
      .from("scenes")
      .select(tier.columns)
      .eq("project_id", projectId)
      .order("sequence_number");

    if (!error) {
      sceneRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
      if (tier.missing) warnings.push(tier.missing);
      break;
    }
  }

  /* ── Cast (Agent 3) ────────────────────────────────────────────────────────── */

  const blueprints = (project.character_blueprints as CharacterBlueprints | null) ?? null;
  const cast: CharacterBlueprint[] = blueprints ? Object.values(blueprints) : [];

  const scenes: SceneBoardScene[] = sceneRows.map((row) => {
    const voiceOverText = (row.voice_over_beat as string) ?? "";
    const finalVideoPrompt = (row.final_video_prompt as string) ?? "";
    return {
      id: row.id as string,
      sequenceNumber: row.sequence_number as number,
      actNumber: Number(row.act_number ?? 1),
      voiceOverText,
      sceneType: (row.scene_type as string) ?? "",
      durationSeconds: Number(row.video_duration ?? 0),
      finalVideoPrompt,
      environment: (row.environment as string) || null,
      lighting: (row.lighting as string) || null,
      cameraDirection: (row.camera_direction as string) || null,
      mediaUrl: (row.custom_media_url as string) || null,
      mediaType: (row.custom_media_type as string) || null,
      generationStatus: (row.generation_status as string) ?? "Pending",
      castNames: castNamesInScene(cast, voiceOverText, finalVideoPrompt),
    };
  });

  /* ── Per-Act narration ─────────────────────────────────────────────────────── */

  const narrationByAct = new Map<
    number,
    { audioUrl: string; durationSeconds: number; startSeconds: number }
  >();

  const { data: narrationRows, error: narrationError } = await supabase
    .from("act_narrations")
    .select("act_number, audio_url, duration_seconds, start_seconds")
    .eq("project_id", projectId)
    .order("act_number");

  if (narrationError) {
    // The table is missing entirely (add-act-narration.sql not run). Not fatal: every
    // act simply reads as "not recorded yet", which is also true of a fresh project.
    warnings.push(
      "Act audio is hidden — run db/add-act-narration.sql to play narration from the board."
    );
  } else {
    for (const row of narrationRows ?? []) {
      narrationByAct.set(Number(row.act_number), {
        audioUrl: row.audio_url as string,
        durationSeconds: Number(row.duration_seconds ?? 0),
        startSeconds: Number(row.start_seconds ?? 0),
      });
    }
  }

  /* ── Act outlines ──────────────────────────────────────────────────────────── */

  const storedOutlines = project.act_outlines as ActOutline[] | null;
  const distinctActNumbers = [...new Set(scenes.map((s) => s.actNumber))].sort((a, b) => a - b);

  const outlines: ActOutline[] =
    storedOutlines && storedOutlines.length > 0
      ? storedOutlines
      : distinctActNumbers.length > 0
        ? distinctActNumbers.map((n) => ({ actNumber: n, title: `Act ${n}`, description: "" }))
        : [
            {
              actNumber: 1,
              title: "Act 1",
              description: project.narrative_arc || project.topic || "",
            },
          ];

  const acts: SceneBoardAct[] = outlines.map((outline) => {
    const actScenes = scenes.filter((s) => s.actNumber === outline.actNumber);
    const narration = narrationByAct.get(outline.actNumber) ?? null;

    // `final_video_prompt` is written by the Prompt Assembler at approval time, so a
    // scene having one is the signal that the visual pass reached it. That is the same
    // signal `approveActVisuals` itself uses to decide what still needs filling in.
    const withVisuals = actScenes.filter((s) => s.finalVideoPrompt.trim().length > 0).length;

    return {
      outline,
      scenes: actScenes,
      narration,
      progress: {
        hasScript: actScenes.length > 0,
        hasAudio: narration !== null,
        hasVisuals: withVisuals > 0,
        isApproved: actScenes.length > 0 && withVisuals === actScenes.length,
      },
    };
  });

  const recordedSeconds = acts.reduce((sum, act) => sum + (act.narration?.durationSeconds ?? 0), 0);
  const targetDuration = (project.target_duration as string) ?? "Short (< 60s)";

  return {
    success: true,
    data: {
      projectId: project.id,
      workspaceId: project.workspace_id,
      workspaceTheme: workspace?.content_theme ?? "",
      narrationVoiceId: workspace?.narration_voice_id ?? "",
      topic: project.topic ?? "",
      narrativeArc: project.narrative_arc ?? "",
      scriptHook: project.story_hook ?? "",
      visualAesthetic: project.visual_aesthetic ?? "",
      targetDuration,
      isSinglePass: outlines.length <= 1,
      acts,
      cast,
      recordedSeconds,
      targetSeconds: TARGET_SECONDS_BY_FORM_VALUE[targetDuration] ?? null,
      warnings,
    },
  };
}
