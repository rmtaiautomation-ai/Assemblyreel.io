"use server";

import { createClient } from "@/lib/supabase/server";

const UPDATABLE_FIELDS = ["track_id", "start_time", "duration", "trim_start"] as const;

export async function createTimelineItem(
  projectId: string,
  mediaId: string,
  fields: { trackId: "A1" | "A2"; startTime: number; duration: number; trimStart?: number }
) {
  if (!projectId || !mediaId) {
    return { success: false, error: "Missing projectId or mediaId" };
  }

  const payload = {
    project_id: projectId,
    media_id: mediaId,
    track_id: fields.trackId,
    start_time: fields.startTime,
    duration: fields.duration,
    trim_start: fields.trimStart ?? 0,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.from("timeline_items").insert(payload).select().single();

  if (error) {
    console.error("[createTimelineItem] Failed to insert timeline item:", error);
    return { success: false, error: error.message };
  }

  return { success: true, timelineItem: data };
}

// `fields` uses snake_case keys matching the DB columns directly (e.g.
// `{ start_time: 4.2 }`), same convention as `updateScene` in scene-actions.ts.
export async function updateTimelineItem(id: string, fields: Record<string, any>) {
  if (!id) {
    return { success: false, error: "Missing id" };
  }

  const payload: Record<string, any> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in fields) payload[key] = fields[key];
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, error: "No updatable fields provided" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("timeline_items").update(payload).eq("id", id);

  if (error) {
    console.error("[updateTimelineItem] Failed to persist timeline item:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteTimelineItem(id: string) {
  if (!id) {
    return { success: false, error: "Missing id" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("timeline_items").delete().eq("id", id);

  if (error) {
    console.error("[deleteTimelineItem] Failed to delete timeline item:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
