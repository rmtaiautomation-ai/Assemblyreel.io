"use server";

import { createClient } from "@/lib/supabase/server";

// Columns the Timeline Editor is allowed to write back to the scenes table.
// Anything not listed here is dropped rather than sent to Supabase.
const UPDATABLE_FIELDS = [
  "voice_over_beat",
  "final_video_prompt",
  "video_duration",
  "ai_model",
  "custom_media_url",
  "custom_media_type",
  "generation_status",
  "trim_start",
  "media_id",
  "audio_url",
  // Require db/add-scene-transitions.sql. Listed here only after that migration runs:
  // updateScene sends one merged payload per scene, and PostgREST rejects a request
  // naming a missing column whole, so an unmigrated database would fail the entire
  // write rather than just this field.
  "transition_type",
  "transition_duration",
] as const;

// Fields accepted when inserting a brand-new scene created by dropping local
// media directly onto the V1 track (as opposed to the AI script pipeline).
const CREATABLE_FIELDS = [
  "sequence_number",
  "video_duration",
  "voice_over_beat",
  "final_video_prompt",
  "generation_status",
  "custom_media_url",
  "custom_media_type",
  "audio_url",
  "media_id",
] as const;

export async function updateScene(sceneId: string, fields: Record<string, any>) {
  if (!sceneId) {
    return { success: false, error: "Missing sceneId" };
  }

  const payload: Record<string, any> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields) payload[key] = fields[key];
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, error: "No updatable fields provided" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scenes").update(payload).eq("id", sceneId);

  if (error) {
    console.error("[updateScene] Failed to persist scene:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteScenes(sceneIds: string[]) {
  if (!sceneIds || sceneIds.length === 0) {
    return { success: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scenes").delete().in("id", sceneIds);

  if (error) {
    console.error("[deleteScenes] Failed to delete scenes:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Inserting or reordering a scene shifts every sibling's position. Persisting
// only the moved scene leaves the rest stale, producing duplicate
// sequence_numbers — and duplicates make `.order('sequence_number')` return an
// arbitrary order, so scenes appear to jump around after a reload.
export async function reorderScenes(updates: Array<{ id: string; sequence_number: number }>) {
  if (!updates || updates.length === 0) {
    return { success: true };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    updates.map(u => supabase.from("scenes").update({ sequence_number: u.sequence_number }).eq("id", u.id))
  );

  const failed = results.find(r => r.error);
  if (failed?.error) {
    console.error("[reorderScenes] Failed to persist scene order:", failed.error);
    return { success: false, error: failed.error.message };
  }

  return { success: true };
}

// Dropping local media onto V1 needs a real INSERT with a real UUID — a temp
// client-side id (Math.random) fails the UUID check `updateScene` relies on,
// so persistSceneFields would silently no-op for it forever.
export async function createSceneWithMedia(projectId: string, mediaId: string, fields: Record<string, any>) {
  if (!projectId || !mediaId) {
    return { success: false, error: "Missing projectId or mediaId" };
  }

  const payload: Record<string, any> = { project_id: projectId, media_id: mediaId };
  for (const key of CREATABLE_FIELDS) {
    if (key in fields) payload[key] = fields[key];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("scenes").insert(payload).select().single();

  if (error) {
    console.error("[createSceneWithMedia] Failed to insert scene:", error);
    return { success: false, error: error.message };
  }

  return { success: true, scene: data };
}
