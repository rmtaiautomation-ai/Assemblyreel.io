"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ART_STYLES,
  ASPECT_RATIOS,
  DURATIONS,
  LANGUAGES,
} from "@/lib/workspace-options";

/**
 * Reads and writes the workspace row's own channel settings — the ones that existed in
 * the database from day one but had no editor anywhere in the app.
 *
 * Every field here was previously write-once: WorkspaceForm set it during the creation
 * wizard and nothing could ever change it again. The hub page rendered them back as a
 * read-only "Style Reference" panel, which made the gap easy to miss — the values were
 * on screen, they just weren't editable. Renaming a channel, or moving it from 9:16 to
 * 16:9, meant deleting the workspace and starting over.
 *
 * Deliberately separate from format-actions.ts. That file owns the *blueprint* columns
 * (format_preset_key / format_blueprint / format_blueprint_version), which are versioned
 * and frozen onto each project at creation so an in-flight video's rules can't shift
 * under it. Nothing here is versioned or snapshotted: these are plain per-channel
 * defaults read fresh at the moment a new video is created, so they must not share the
 * blueprint's version-bumping save path.
 */

export interface WorkspaceChannelSettings {
  name: string;
  contentTheme: string;
  narrationVoiceId: string;
  visualAesthetic: string;
  aspectRatio: string;
  videoLanguage: string;
  durationPref: string;
  destination: string;
}

export interface LoadChannelSettingsResult {
  success: boolean;
  settings?: WorkspaceChannelSettings;
  error?: string;
}

/** `linked_accounts` is a jsonb array; only the first entry is ever used as the destination. */
function firstLinkedAccount(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

export async function getWorkspaceChannelSettings(
  workspaceId: string
): Promise<LoadChannelSettingsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "name, content_theme, narration_voice_id, visual_aesthetic, aspect_ratio, video_language, duration_pref, linked_accounts"
    )
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Workspace not found." };
  }

  return {
    success: true,
    settings: {
      name: data.name ?? "",
      contentTheme: data.content_theme ?? "",
      narrationVoiceId: data.narration_voice_id ?? "",
      visualAesthetic: data.visual_aesthetic ?? "",
      aspectRatio: data.aspect_ratio ?? "",
      videoLanguage: data.video_language ?? "",
      durationPref: data.duration_pref ?? "",
      destination: firstLinkedAccount(data.linked_accounts),
    },
  };
}

/**
 * Validates one select-backed field.
 *
 * Lenient by design: a value is rejected only if it is non-empty AND unrecognised. Rows
 * created before these lists existed hold things like a bare `"16:9"` from the column
 * default, and the form deliberately keeps such a value selectable rather than silently
 * rewriting a channel's aspect ratio the first time someone opens Settings. Re-saving an
 * untouched legacy value therefore has to succeed.
 */
function invalidChoice(
  label: string,
  value: string,
  allowed: readonly string[],
  original: string
): string | null {
  if (!value) return null;
  if (allowed.includes(value)) return null;
  if (value === original) return null;
  return `${label} is not one of the available options.`;
}

export async function saveWorkspaceChannelSettings(
  workspaceId: string,
  settings: WorkspaceChannelSettings
): Promise<{ success: boolean; error?: string }> {
  const name = settings.name.trim();
  if (!name) return { success: false, error: "Channel name cannot be empty." };

  const current = await getWorkspaceChannelSettings(workspaceId);
  if (!current.success || !current.settings) {
    return { success: false, error: current.error ?? "Workspace not found." };
  }
  const before = current.settings;

  const problem =
    invalidChoice("Art style", settings.visualAesthetic, ART_STYLES, before.visualAesthetic) ??
    invalidChoice("Aspect ratio", settings.aspectRatio, ASPECT_RATIOS, before.aspectRatio) ??
    invalidChoice("Language", settings.videoLanguage, LANGUAGES, before.videoLanguage) ??
    invalidChoice("Target length", settings.durationPref, DURATIONS, before.durationPref);
  if (problem) return { success: false, error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      name,
      content_theme: settings.contentTheme.trim(),
      // Empty means "let Voice Studio's active engine decide" — the column is nullable and
      // `resolveValidVoice` already treats an absent id that way, so store NULL rather than
      // an empty string the TTS layer would have to special-case.
      narration_voice_id: settings.narrationVoiceId || null,
      visual_aesthetic: settings.visualAesthetic,
      aspect_ratio: settings.aspectRatio,
      video_language: settings.videoLanguage,
      duration_pref: settings.durationPref,
      linked_accounts: settings.destination ? [settings.destination] : [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (error) return { success: false, error: error.message };

  // The hub's header, Style Reference panel and New Video form all render these values
  // from the server, so a save that didn't revalidate would look like it hadn't saved
  // until a hard reload.
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/settings`);
  revalidatePath("/workspaces");

  return { success: true };
}
