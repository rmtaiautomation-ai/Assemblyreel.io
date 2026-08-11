"use server";

import { createClient } from "@/lib/supabase/server";
import { getTransitionMusicPreset } from "@/lib/transition-music-presets";

const CREATABLE_FIELDS = [
  "media_type",
  "source",
  "status",
  "storage_path",
  "url",
  "original_filename",
  "duration_seconds",
  "provider_model",
  "provider_metadata",
  "error_message",
] as const;

const UPDATABLE_FIELDS = [
  "status",
  "source",
  "storage_path",
  "url",
  "duration_seconds",
  "provider_metadata",
  "error_message",
] as const;

export async function createMediaRecord(projectId: string, fields: Record<string, any>) {
  if (!projectId) {
    return { success: false, error: "Missing projectId" };
  }

  const payload: Record<string, any> = { project_id: projectId };
  for (const key of CREATABLE_FIELDS) {
    if (key in fields) payload[key] = fields[key];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("media").insert(payload).select().single();

  if (error) {
    console.error("[createMediaRecord] Failed to insert media:", error);
    return { success: false, error: error.message };
  }

  return { success: true, media: data };
}

export async function updateMediaStatus(mediaId: string, fields: Record<string, any>) {
  if (!mediaId) {
    return { success: false, error: "Missing mediaId" };
  }

  const payload: Record<string, any> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields) payload[key] = fields[key];
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, error: "No updatable fields provided" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("media").update(payload).eq("id", mediaId).select().single();

  if (error) {
    console.error("[updateMediaStatus] Failed to update media:", error);
    return { success: false, error: error.message };
  }

  return { success: true, media: data };
}

/**
 * Resolves a transition-sound preset (see src/lib/transition-music-presets.ts)
 * to a real `media.id` for this project, creating the row on first use.
 *
 * `timeline_items.media_id` is a required FK and `media.project_id` is a
 * required FK too — there is no such thing as a global/shared media row, so
 * every project needs its own row per preset even though they all point at
 * the same bundled file. Looked up by (`project_id`, `original_filename`,
 * `source = 'preset'`) rather than a dedicated join table, since this is a
 * handful of rows per project, not a relationship worth its own schema.
 *
 * Requires db/add-preset-media-source.sql to have run — until it has,
 * `source: 'preset'` is rejected by the `media_source_check` constraint and
 * this returns `{ success: false }` rather than silently miscategorizing the
 * row under some other source value.
 */
export async function getOrCreatePresetMedia(projectId: string, presetKey: string) {
  if (!projectId || !presetKey) {
    return { success: false, error: "Missing projectId or presetKey" };
  }

  const preset = getTransitionMusicPreset(presetKey);
  if (!preset) {
    return { success: false, error: `Unknown transition-music preset: ${presetKey}` };
  }

  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("media")
    .select("id")
    .eq("project_id", projectId)
    .eq("source", "preset")
    .eq("original_filename", presetKey)
    .maybeSingle();

  if (lookupError) {
    console.error("[getOrCreatePresetMedia] Lookup failed:", lookupError);
    return { success: false, error: lookupError.message };
  }
  if (existing) {
    return { success: true, mediaId: existing.id };
  }

  const created = await createMediaRecord(projectId, {
    media_type: "audio",
    source: "preset",
    status: "ready",
    storage_path: null,
    url: preset.url,
    original_filename: preset.key,
    duration_seconds: preset.durationSeconds,
  });

  if (!created.success || !created.media) {
    return { success: false, error: created.error || "Failed to create preset media row" };
  }

  return { success: true, mediaId: created.media.id };
}

export async function deleteMediaRecord(mediaId: string) {
  if (!mediaId) {
    return { success: false, error: "Missing mediaId" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("media").delete().eq("id", mediaId);

  if (error) {
    console.error("[deleteMediaRecord] Failed to delete media:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
