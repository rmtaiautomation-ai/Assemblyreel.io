"use server";

import { createClient } from "@/lib/supabase/server";

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
