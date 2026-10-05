"use server";

import { ComboId, directSceneEdits } from "@/lib/ai/agents/edit-director";
import { getComboConfigs } from "@/lib/combo-templates";
import { createOverlayClip, deleteOverlayClip } from "./overlay-clip-actions";


export async function applyComboToScene(
  projectId: string,
  sceneId: string,
  comboId: ComboId,
  text: string | undefined,
  startTime: number,
  duration: number,
  replaceClipIds?: string[]
) {
  // Delete any previous AI overlay clips to avoid stacking
  if (replaceClipIds && replaceClipIds.length > 0) {
    for (const clipId of replaceClipIds) {
      await deleteOverlayClip(clipId);
    }
  }

  if (comboId === "clean") {
    return { success: true, createdClips: [], comboId };
  }

  const configs = getComboConfigs(comboId, text);
  const createdClips = [];
  const displayText = text && text.trim().length > 0 ? text.trim() : "Headline Statement";

  for (const config of configs) {
    const res = await createOverlayClip(projectId, {
      kind: config.kind,
      preset: config.preset,
      text: config.kind === 'text' ? displayText : "",
      dimBackground: config.dimBackground,
      templateData: config.templateData,
      startTime,
      duration,
      origin: 'ai'
    });
    if (res.success && res.overlayClip) {
      createdClips.push(res.overlayClip);
    } else {
      console.error("[applyComboToScene] Error inserting clip:", res?.error);
    }
  }

  if (configs.length > 0 && createdClips.length === 0) {
    return { success: false, error: "Failed to create template clips. Please try again." };
  }

  return { success: true, createdClips, comboId };
}

export async function autoDirectSingleSceneAction(
  projectId: string,
  sceneId: string,
  sceneText: string,
  startTime: number,
  duration: number,
  topic: string = "video topic",
  visualAesthetic: string = "cinematic",
  replaceClipIds?: string[]
) {
  try {
    const results = await directSceneEdits({
      scenes: [{ sceneId, sceneText }],
      topic,
      visualAesthetic,
    });

    const decision = results[0]?.decision;
    if (!decision) {
      // Fallback to title reveal or clean
      return await applyComboToScene(projectId, sceneId, "clean", sceneText, startTime, duration, replaceClipIds);
    }

    const displayText = decision.overlayText || sceneText;
    return await applyComboToScene(
      projectId,
      sceneId,
      decision.comboId,
      displayText,
      startTime,
      duration,
      replaceClipIds
    );
  } catch (error: any) {
    console.error("[autoDirectSingleSceneAction] Error:", error);
    return { success: false, error: error.message || "Failed to auto-direct scene" };
  }
}

