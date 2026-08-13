"use server";

import { createClient } from "@/lib/supabase/server";

// Columns the Timeline Editor is allowed to write back to overlay_clips.
// Anything not listed here is dropped rather than sent to Supabase — same
// allowlist convention as scene-actions.ts and timeline-actions.ts.
//
// All of these ship in db/create-overlay-clips.sql, which creates the table
// whole, so there is no partial-migration hazard here the way there is for a
// column added to an existing table: either the table exists with every one of
// these, or it doesn't exist at all.
//
// "kind" and "template_data" are the exception — they require
// db/add-overlay-clip-templates.sql to have run first, same "requires
// migration" caveat as every other field added to an existing table elsewhere
// in this app. Writing them before that migration runs fails at the DB level
// (unknown column), not silently.
const UPDATABLE_FIELDS = [
  "text",
  "kicker_text",
  "preset",
  "color",
  "font_size",
  "x_percent",
  "y_percent",
  "dim_background",
  "start_time",
  "duration",
  "kind",
  "template_data",
] as const;

export async function createOverlayClip(
  projectId: string,
  fields: {
    text?: string;
    kickerText?: string | null;
    preset?: string;
    color?: string;
    fontSize?: number | null;
    xPercent?: number;
    yPercent?: number;
    dimBackground?: boolean;
    startTime: number;
    duration: number;
    /** Requires db/add-overlay-clip-templates.sql to have run. Defaults to 'text'. */
    kind?: string;
    templateData?: Record<string, unknown>;
  }
) {
  if (!projectId) {
    return { success: false, error: "Missing projectId" };
  }

  // Defaults mirror the column defaults in db/create-overlay-clips.sql rather
  // than relying on them, so a clip created here has the same shape the editor
  // already rendered optimistically — a round-trip can't silently change what
  // the user is looking at.
  const payload: Record<string, any> = {
    project_id: projectId,
    text: fields.text ?? "",
    kicker_text: fields.kickerText ?? null,
    preset: fields.preset ?? "cinematic-reveal",
    color: fields.color ?? "#FFFFFF",
    font_size: fields.fontSize ?? null,
    x_percent: fields.xPercent ?? 50,
    y_percent: fields.yPercent ?? 50,
    dim_background: fields.dimBackground ?? false,
    start_time: fields.startTime,
    duration: fields.duration,
  };

  // Only sent when provided, so a plain-text clip's insert payload is
  // byte-for-byte what it was before this field existed — no dependency on
  // the migration having run for the common case.
  if (fields.kind !== undefined) payload.kind = fields.kind;
  if (fields.templateData !== undefined) payload.template_data = fields.templateData;

  const supabase = await createClient();
  const { data, error } = await supabase.from("overlay_clips").insert(payload).select().single();

  if (error) {
    console.error("[createOverlayClip] Failed to insert overlay clip:", error);
    return { success: false, error: error.message };
  }

  return { success: true, overlayClip: data };
}

// `fields` uses snake_case keys matching the DB columns directly (e.g.
// `{ x_percent: 42 }`), same convention as updateScene / updateTimelineItem.
export async function updateOverlayClip(id: string, fields: Record<string, any>) {
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
  const { error } = await supabase.from("overlay_clips").update(payload).eq("id", id);

  if (error) {
    console.error("[updateOverlayClip] Failed to persist overlay clip:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteOverlayClip(id: string) {
  if (!id) {
    return { success: false, error: "Missing id" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("overlay_clips").delete().eq("id", id);

  if (error) {
    console.error("[deleteOverlayClip] Failed to delete overlay clip:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
