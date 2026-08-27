import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { composeThumbnailConcept } from "./agents/thumbnail-composer";
import { geminiImageProvider } from "./providers/gemini-image";
import type { FormatProfile } from "./format-profile";
import type { SceneType } from "./generation-rules";

const execFileAsync = promisify(execFile);

/**
 * The Thumbnail Generator's shared compositing step.
 *
 * Both the concept pass (before render, source is a key-art still) and the final pass
 * (after render, source is an extracted video frame) funnel through this one function —
 * only how the reference image upstream of it was produced differs. Mirrors
 * `enrichScenesWithVisualPrompts` in spirit: this module chains an agent call and a
 * provider call, but does no Supabase I/O itself. The caller (`thumbnail-actions.ts`)
 * owns reads/writes, same split as `orchestrator.ts` / `orchestrator-actions.ts`.
 */

export interface RunThumbnailCompositePassParams {
  topic: string;
  formatProfile: FormatProfile;
  /** Prose description of what the reference image shows — a scene's `final_video_prompt` for the concept pass, a caption of the frame for the final pass. */
  sourceDescription: string;
  /** Local, public-relative URL of the reference image (see `GenerateInput.referenceImageUrl`). */
  referenceImageUrl: string;
  projectId: string;
  /** The `media` row id the composited output will be written to. */
  compositedMediaId: string;
  /** Forces the headline text on a regenerate rather than leaving the agent's own pick. */
  headlineOverride?: string;
}

export interface ThumbnailCompositeOutcome {
  success: boolean;
  headlineText?: string;
  conceptNotes?: { subjectFraming: string; graphicElement: string; colorAccent: string };
  compositedImageUrl?: string;
  compositedStoragePath?: string;
  error?: string;
}

export async function runThumbnailCompositePass({
  topic,
  formatProfile,
  sourceDescription,
  referenceImageUrl,
  projectId,
  compositedMediaId,
  headlineOverride,
}: RunThumbnailCompositePassParams): Promise<ThumbnailCompositeOutcome> {
  const { concept, error: conceptError } = await composeThumbnailConcept({
    topic,
    formatProfile,
    sourceDescription,
  });

  if (!concept) {
    return { success: false, error: conceptError ?? "Thumbnail Composer failed to produce a concept." };
  }

  const headlineText = headlineOverride?.trim() || concept.headlineText;
  const compositePrompt = headlineOverride?.trim()
    ? `${concept.compositePrompt} The headline text must read exactly: "${headlineOverride.trim()}".`
    : concept.compositePrompt;

  const result = await geminiImageProvider.start({
    prompt: compositePrompt,
    projectId,
    mediaId: compositedMediaId,
    referenceImageUrl,
  });

  if (result.status !== "completed") {
    return {
      success: false,
      error: result.status === "failed" ? result.error : "Thumbnail compositing did not complete synchronously.",
    };
  }

  return {
    success: true,
    headlineText,
    conceptNotes: {
      subjectFraming: concept.subjectFraming,
      graphicElement: concept.graphicElement,
      colorAccent: concept.colorAccent,
    },
    compositedImageUrl: result.url,
    compositedStoragePath: result.storagePath,
  };
}

/* -------------------------------------------------------------------------- */
/*                      Concept pass — picking a source scene                 */
/* -------------------------------------------------------------------------- */

export interface SceneForThumbnail {
  id: string;
  sequenceNumber: number;
  finalVideoPrompt: string | null;
  sceneType: SceneType | null;
  /** Only populated/used by the final pass — irrelevant to `pickRepresentativeScene`. */
  durationSeconds?: number | null;
}

/** Scene types that make for the strongest hero frame, in preference order. */
const PREFERRED_SCENE_TYPES: readonly SceneType[] = ["ACTION", "DIVINE", "ESTABLISH"];

/**
 * Picks the scene concept-pass key art should be built from.
 *
 * Pure and DB-free so it can be tested without Supabase — the caller fetches scenes
 * and hands them in. Prefers the scene types documentary/action channels actually lead
 * with (see `FormatVisual.preferredSceneTypes`), falling back to the earliest scene
 * with a usable prompt when scene-type metadata is unavailable (pre-migration projects).
 */
export function pickRepresentativeScene(
  scenes: readonly SceneForThumbnail[]
): SceneForThumbnail | null {
  const usable = scenes.filter((scene) => scene.finalVideoPrompt?.trim());
  if (usable.length === 0) return null;

  for (const preferredType of PREFERRED_SCENE_TYPES) {
    const match = usable.find((scene) => scene.sceneType === preferredType);
    if (match) return match;
  }

  return [...usable].sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];
}

/* -------------------------------------------------------------------------- */
/*                    Final pass — extracting real video frames               */
/* -------------------------------------------------------------------------- */

export interface CandidateFrame {
  sceneId: string;
  timestampSeconds: number;
}

const DEFAULT_SCENE_DURATION_SECONDS = 5;
const MAX_CANDIDATES = 3;

/**
 * Picks up to `MAX_CANDIDATES` timestamps to extract as final-pass frame candidates —
 * the midpoint of the same scene types `pickRepresentativeScene` prefers, resolved
 * against real cumulative scene timing now that a render exists. Falls back to the
 * earliest scenes when duration/type metadata is missing, same degrade-gracefully
 * shape as the concept-pass picker.
 */
export function pickCandidateFrames(scenes: readonly SceneForThumbnail[]): CandidateFrame[] {
  if (scenes.length === 0) return [];

  const ordered = [...scenes].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  let cumulativeStart = 0;
  const withTiming = ordered.map((scene) => {
    const duration = scene.durationSeconds ?? DEFAULT_SCENE_DURATION_SECONDS;
    const midpoint = cumulativeStart + duration / 2;
    cumulativeStart += duration;
    return { scene, midpoint };
  });

  const scored: { scene: SceneForThumbnail; midpoint: number; rank: number }[] = withTiming.map(
    ({ scene, midpoint }) => {
      const preferenceIndex = PREFERRED_SCENE_TYPES.indexOf(scene.sceneType as SceneType);
      return { scene, midpoint, rank: preferenceIndex === -1 ? PREFERRED_SCENE_TYPES.length : preferenceIndex };
    }
  );

  scored.sort((a, b) => a.rank - b.rank || a.scene.sequenceNumber - b.scene.sequenceNumber);

  return scored.slice(0, MAX_CANDIDATES).map(({ scene, midpoint }) => ({
    sceneId: scene.id,
    timestampSeconds: midpoint,
  }));
}

/**
 * Extracts a single still frame from a local mp4 via ffmpeg.
 *
 * Shells out rather than pulling in a frame-extraction dependency: Remotion's own
 * render pipeline already assumes a capable local machine (headless Chrome, heavy
 * encoding), so requiring `ffmpeg` on PATH is not a new class of fragility for this
 * app. Returns a clear failure instead of throwing when the binary is missing, so a
 * host without ffmpeg degrades to "final thumbnails unavailable" rather than crashing
 * the request.
 */
export async function extractVideoFrame(params: {
  mp4Path: string;
  timestampSeconds: number;
  outputPath: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      params.timestampSeconds.toFixed(2),
      "-i",
      params.mp4Path,
      "-frames:v",
      "1",
      params.outputPath,
    ]);
    return { success: true };
  } catch (error) {
    console.error("[Thumbnail Orchestrator] ffmpeg frame extraction failed:", error);
    return {
      success: false,
      error: (error as Error).message || "ffmpeg frame extraction failed.",
    };
  }
}

/** Where a project's finished export lives — matches `src/app/api/render-remotion/route.ts`. */
export function finalExportPath(projectId: string): string {
  return path.join(process.cwd(), "public", "media", "final_exports", `${projectId}.mp4`);
}
