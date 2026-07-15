"use server";

import { createClient } from "@/lib/supabase/server";
import { generateSceneSpeech } from "@/lib/ai/elevenlabs";

export async function generateSceneAudio(sceneId: string, text: string, voiceId?: string) {
  if (!sceneId || !text) {
    return { success: false, error: "Missing sceneId or text" };
  }

  const supabaseAdmin = await createClient();

  // 1. Call ElevenLabs API
  const result = await generateSceneSpeech(text, sceneId, voiceId);

  if (!result.success || !result.audioUrl) {
    return { success: false, error: result.error || "Failed to generate audio" };
  }

  // 2. Update the Scene row in Supabase
  const { error } = await supabaseAdmin
    .from('scenes')
    .update({ audio_url: result.audioUrl })
    .eq('id', sceneId);

  if (error) {
    console.error("Error updating scene with audio URL:", error);
    return { success: false, error: "Failed to update database" };
  }

  return { success: true, audioUrl: result.audioUrl };
}
