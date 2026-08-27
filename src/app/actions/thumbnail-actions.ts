"use server";

import fs from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { resolveProjectFormatProfile } from "./format-actions";
import { createMediaRecord, updateMediaStatus } from "./media-actions";
import { geminiImageProvider } from "@/lib/ai/providers/gemini-image";
import {
  runThumbnailCompositePass,
  pickRepresentativeScene,
  pickCandidateFrames,
  extractVideoFrame,
  finalExportPath,
  type SceneForThumbnail,
} from "@/lib/ai/thumbnail-orchestrator";
import type { FormatProfile } from "@/lib/ai/format-profile";
import type { SceneType } from "@/lib/ai/generation-rules";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const MIGRATION_HINT = "Run db/add-thumbnails.sql in the Supabase SQL editor to enable thumbnails.";

/**
 * Thin server-action layer over `thumbnail-orchestrator.ts`, following the same split
 * as `orchestrator-actions.ts` / `orchestrator.ts`: every Supabase read/write happens
 * here, the orchestrator only chains the agent call and the image provider call.
 */

export interface ThumbnailRow {
  id: string;
  pass: "concept" | "final";
  status: "generating" | "ready" | "failed";
  headline_text: string | null;
  concept_notes: Record<string, string>;
  is_selected: boolean;
  error_message: string | null;
  created_at: string;
  source_media?: { url: string | null } | null;
  composited_media?: { url: string | null } | null;
}

const THUMBNAIL_SELECT =
  "id, pass, status, headline_text, concept_notes, is_selected, error_message, created_at, " +
  "source_media:media!thumbnails_source_media_id_fkey(url), " +
  "composited_media:media!thumbnails_composited_media_id_fkey(url)";

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

export async function listThumbnails(
  projectId: string
): Promise<{ success: boolean; thumbnails?: ThumbnailRow[]; error?: string }> {
  if (!projectId) return { success: false, error: "Missing projectId" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("thumbnails")
    .select(THUMBNAIL_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: `${error.message}. ${MIGRATION_HINT}` };
  }

  return { success: true, thumbnails: (data as unknown as ThumbnailRow[]) ?? [] };
}

/* -------------------------------------------------------------------------- */
/*                          Shared scene / project reads                      */
/* -------------------------------------------------------------------------- */

async function fetchProjectTopic(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase.from("video_projects").select("topic").eq("id", projectId).single();
  return (data?.topic as string) ?? null;
}

/**
 * Reads scenes for a project, degrading to a select without `scene_type`/`video_duration`
 * when the columns don't exist yet — same "full select, fall back to a narrower one on
 * error" shape `format-actions.ts` uses for its own optional columns.
 */
async function fetchScenesForThumbnail(
  supabase: SupabaseClient,
  projectId: string
): Promise<SceneForThumbnail[]> {
  const full = await supabase
    .from("scenes")
    .select("id, sequence_number, final_video_prompt, scene_type, video_duration")
    .eq("project_id", projectId);

  if (!full.error && full.data) {
    return full.data.map((scene: any) => ({
      id: scene.id,
      sequenceNumber: scene.sequence_number,
      finalVideoPrompt: scene.final_video_prompt,
      sceneType: (scene.scene_type as SceneType) ?? null,
      durationSeconds: scene.video_duration,
    }));
  }

  const fallback = await supabase
    .from("scenes")
    .select("id, sequence_number, final_video_prompt")
    .eq("project_id", projectId);

  return (fallback.data ?? []).map((scene: any) => ({
    id: scene.id,
    sequenceNumber: scene.sequence_number,
    finalVideoPrompt: scene.final_video_prompt,
    sceneType: null,
    durationSeconds: null,
  }));
}

/* -------------------------------------------------------------------------- */
/*                              Concept pass                                  */
/* -------------------------------------------------------------------------- */

export interface GenerateThumbnailsResult {
  success: boolean;
  thumbnails?: ThumbnailRow[];
  error?: string;
}

async function insertGeneratingThumbnail(
  supabase: SupabaseClient,
  fields: Record<string, unknown>
): Promise<{ id: string } | null> {
  const { data, error } = await supabase.from("thumbnails").insert(fields).select("id").single();
  if (error) {
    console.error("[thumbnail-actions] Failed to insert thumbnail row:", error);
    return null;
  }
  return data as { id: string };
}

async function finishThumbnail(
  supabase: SupabaseClient,
  thumbnailId: string,
  compositedMediaId: string,
  topic: string,
  formatProfile: FormatProfile,
  sourceDescription: string,
  referenceImageUrl: string,
  projectId: string,
  headlineOverride?: string
): Promise<ThumbnailRow | null> {
  const outcome = await runThumbnailCompositePass({
    topic,
    formatProfile,
    sourceDescription,
    referenceImageUrl,
    projectId,
    compositedMediaId,
    headlineOverride,
  });

  if (!outcome.success) {
    await updateMediaStatus(compositedMediaId, { status: "failed", error_message: outcome.error });
    await supabase
      .from("thumbnails")
      .update({ status: "failed", error_message: outcome.error })
      .eq("id", thumbnailId);
    return null;
  }

  await updateMediaStatus(compositedMediaId, {
    status: "ready",
    url: outcome.compositedImageUrl,
    ...(outcome.compositedStoragePath ? { storage_path: outcome.compositedStoragePath } : {}),
  });

  const { data } = await supabase
    .from("thumbnails")
    .update({
      status: "ready",
      composited_media_id: compositedMediaId,
      headline_text: outcome.headlineText,
      concept_notes: outcome.conceptNotes ?? {},
    })
    .eq("id", thumbnailId)
    .select(THUMBNAIL_SELECT)
    .single();

  return (data as unknown as ThumbnailRow) ?? null;
}

/**
 * Generates one concept-pass thumbnail from the project's strongest already-generated
 * scene — no render dependency, callable as soon as scenes have visual prompts. Call
 * again for another variant; each call re-runs the Thumbnail Composer at the same
 * creative temperature the rest of the pipeline uses, so variants differ naturally.
 */
export async function generateConceptThumbnails(projectId: string): Promise<GenerateThumbnailsResult> {
  if (!projectId) return { success: false, error: "Missing projectId" };

  const supabase = await createClient();
  const [topic, formatProfile, scenes] = await Promise.all([
    fetchProjectTopic(supabase, projectId),
    resolveProjectFormatProfile(supabase, projectId),
    fetchScenesForThumbnail(supabase, projectId),
  ]);

  if (!topic) return { success: false, error: "Project not found." };

  const scene = pickRepresentativeScene(scenes);
  if (!scene || !scene.finalVideoPrompt) {
    return {
      success: false,
      error: "No scenes with a generated visual prompt yet — run script and visual generation first.",
    };
  }

  const keyArt = await createMediaRecord(projectId, {
    media_type: "image",
    source: "gemini",
    status: "generating",
    provider_model: "gemini-image",
  });
  if (!keyArt.success || !keyArt.media) {
    return { success: false, error: keyArt.error || "Failed to create key-art media record." };
  }

  const thumbnail = await insertGeneratingThumbnail(supabase, {
    project_id: projectId,
    pass: "concept",
    status: "generating",
    source_kind: "key_art",
    source_media_id: keyArt.media.id,
    source_scene_id: scene.id,
    format_blueprint_snapshot: formatProfile,
  });
  if (!thumbnail) {
    return { success: false, error: `Failed to create thumbnail record. ${MIGRATION_HINT}` };
  }

  const keyArtResult = await geminiImageProvider.start({
    prompt: scene.finalVideoPrompt,
    projectId,
    mediaId: keyArt.media.id,
  });

  if (keyArtResult.status !== "completed") {
    const error = keyArtResult.status === "failed" ? keyArtResult.error : "Key-art generation did not complete.";
    await updateMediaStatus(keyArt.media.id, { status: "failed", error_message: error });
    await supabase.from("thumbnails").update({ status: "failed", error_message: error }).eq("id", thumbnail.id);
    return { success: false, error };
  }

  await updateMediaStatus(keyArt.media.id, {
    status: "ready",
    url: keyArtResult.url,
    ...(keyArtResult.storagePath ? { storage_path: keyArtResult.storagePath } : {}),
  });

  const composited = await createMediaRecord(projectId, {
    media_type: "image",
    source: "gemini",
    status: "generating",
    provider_model: "gemini-image",
  });
  if (!composited.success || !composited.media) {
    const error = composited.error || "Failed to create composited media record.";
    await supabase.from("thumbnails").update({ status: "failed", error_message: error }).eq("id", thumbnail.id);
    return { success: false, error };
  }

  const finished = await finishThumbnail(
    supabase,
    thumbnail.id,
    composited.media.id,
    topic,
    formatProfile,
    scene.finalVideoPrompt,
    keyArtResult.url,
    projectId
  );

  if (!finished) {
    return { success: false, error: "Thumbnail compositing failed. Check the thumbnail's error for detail." };
  }

  return { success: true, thumbnails: [finished] };
}

/* -------------------------------------------------------------------------- */
/*                                Final pass                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generates final-pass thumbnails from real frames of the finished render — up to 3
 * candidates, picked from the same preferred scene types as the concept pass but
 * resolved against actual scene timing now that a render exists.
 */
export async function generateFinalThumbnails(projectId: string): Promise<GenerateThumbnailsResult> {
  if (!projectId) return { success: false, error: "Missing projectId" };

  const mp4Path = finalExportPath(projectId);
  try {
    await fs.access(mp4Path);
  } catch {
    return { success: false, error: "Render the video first — no finished export was found for this project." };
  }

  const supabase = await createClient();
  const [topic, formatProfile, scenes] = await Promise.all([
    fetchProjectTopic(supabase, projectId),
    resolveProjectFormatProfile(supabase, projectId),
    fetchScenesForThumbnail(supabase, projectId),
  ]);

  if (!topic) return { success: false, error: "Project not found." };

  const candidates = pickCandidateFrames(scenes);
  if (candidates.length === 0) {
    return { success: false, error: "No scenes found for this project." };
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const results: ThumbnailRow[] = [];

  for (const candidate of candidates) {
    const scene = sceneById.get(candidate.sceneId);
    const sourceDescription = scene?.finalVideoPrompt || "A still frame from the video.";

    const frameMedia = await createMediaRecord(projectId, {
      media_type: "image",
      source: "ffmpeg-frame",
      status: "generating",
    });
    if (!frameMedia.success || !frameMedia.media) continue;

    const thumbnail = await insertGeneratingThumbnail(supabase, {
      project_id: projectId,
      pass: "final",
      status: "generating",
      source_kind: "rendered_frame",
      source_media_id: frameMedia.media.id,
      source_scene_id: candidate.sceneId,
      source_timestamp_seconds: candidate.timestampSeconds,
      format_blueprint_snapshot: formatProfile,
    });
    if (!thumbnail) continue;

    const outputDir = path.join(process.cwd(), "public", "media", projectId);
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${frameMedia.media.id}.png`);

    const extraction = await extractVideoFrame({
      mp4Path,
      timestampSeconds: candidate.timestampSeconds,
      outputPath,
    });

    if (!extraction.success) {
      await updateMediaStatus(frameMedia.media.id, { status: "failed", error_message: extraction.error });
      await supabase
        .from("thumbnails")
        .update({ status: "failed", error_message: extraction.error })
        .eq("id", thumbnail.id);
      continue;
    }

    const frameUrl = `/media/${projectId}/${frameMedia.media.id}.png`;
    await updateMediaStatus(frameMedia.media.id, {
      status: "ready",
      url: frameUrl,
      storage_path: `media/${projectId}/${frameMedia.media.id}.png`,
    });

    const composited = await createMediaRecord(projectId, {
      media_type: "image",
      source: "gemini",
      status: "generating",
      provider_model: "gemini-image",
    });
    if (!composited.success || !composited.media) continue;

    const finished = await finishThumbnail(
      supabase,
      thumbnail.id,
      composited.media.id,
      topic,
      formatProfile,
      sourceDescription,
      frameUrl,
      projectId
    );
    if (finished) results.push(finished);
  }

  if (results.length === 0) {
    return { success: false, error: "None of the candidate frames produced a usable thumbnail." };
  }

  return { success: true, thumbnails: results };
}

/* -------------------------------------------------------------------------- */
/*                          Regenerate / select / delete                      */
/* -------------------------------------------------------------------------- */

export interface RegenerateThumbnailResult {
  success: boolean;
  thumbnail?: ThumbnailRow;
  error?: string;
}

/** Re-runs only the compositing step against the same reference image and project topic. */
export async function regenerateThumbnail(
  thumbnailId: string,
  overrides?: { headlineText?: string }
): Promise<RegenerateThumbnailResult> {
  if (!thumbnailId) return { success: false, error: "Missing thumbnailId" };

  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("thumbnails")
    .select(
      "project_id, format_blueprint_snapshot, source_kind, source_scene_id, source_media:media!thumbnails_source_media_id_fkey(url)"
    )
    .eq("id", thumbnailId)
    .single();

  if (error || !existing) {
    return { success: false, error: error?.message || "Thumbnail not found." };
  }

  const referenceImageUrl = (existing.source_media as unknown as { url: string } | null)?.url;
  if (!referenceImageUrl) {
    return { success: false, error: "This thumbnail's source image is missing — regenerate it from scratch instead." };
  }

  const projectId = existing.project_id as string;
  const formatProfile = existing.format_blueprint_snapshot as FormatProfile;

  const [topic, scenes] = await Promise.all([
    fetchProjectTopic(supabase, projectId),
    fetchScenesForThumbnail(supabase, projectId),
  ]);
  if (!topic) return { success: false, error: "Project not found." };

  const scene = scenes.find((s) => s.id === existing.source_scene_id);
  const sourceDescription = scene?.finalVideoPrompt || "A still frame from the video.";

  const composited = await createMediaRecord(projectId, {
    media_type: "image",
    source: "gemini",
    status: "generating",
    provider_model: "gemini-image",
  });
  if (!composited.success || !composited.media) {
    return { success: false, error: composited.error || "Failed to create composited media record." };
  }

  const finished = await finishThumbnail(
    supabase,
    thumbnailId,
    composited.media.id,
    topic,
    formatProfile,
    sourceDescription,
    referenceImageUrl,
    projectId,
    overrides?.headlineText
  );

  if (!finished) {
    return { success: false, error: "Regeneration failed. Check the thumbnail's error for detail." };
  }

  return { success: true, thumbnail: finished };
}

export async function selectThumbnail(thumbnailId: string): Promise<{ success: boolean; error?: string }> {
  if (!thumbnailId) return { success: false, error: "Missing thumbnailId" };

  const supabase = await createClient();
  const { data: thumbnail, error: readError } = await supabase
    .from("thumbnails")
    .select("project_id")
    .eq("id", thumbnailId)
    .single();

  if (readError || !thumbnail) {
    return { success: false, error: readError?.message || "Thumbnail not found." };
  }

  await supabase.from("thumbnails").update({ is_selected: false }).eq("project_id", thumbnail.project_id);
  const { error } = await supabase.from("thumbnails").update({ is_selected: true }).eq("id", thumbnailId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteThumbnail(thumbnailId: string): Promise<{ success: boolean; error?: string }> {
  if (!thumbnailId) return { success: false, error: "Missing thumbnailId" };

  const supabase = await createClient();
  const { error } = await supabase.from("thumbnails").delete().eq("id", thumbnailId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
