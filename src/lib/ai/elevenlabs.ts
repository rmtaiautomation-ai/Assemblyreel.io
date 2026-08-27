"use server";

import fs from "fs";
import path from "path";
import type { DeliverySpec } from "./format-profile";

/**
 * Voice settings this call falls back to when the caller supplies none — the exact
 * values this module hardcoded before the Channel Blueprint existed. Every migrated
 * FormatProfile preset carries these same numbers (see `format-profile.ts`), so a
 * caller that resolves a profile and passes its `delivery.elevenlabs` through gets
 * identical synthesis to a caller that passes nothing at all.
 */
const DEFAULT_VOICE_SETTINGS: DeliverySpec["elevenlabs"] = {
  stability: 0.5,
  similarityBoost: 0.5,
};

export async function generateSceneSpeech(
  text: string,
  sceneId: string,
  voiceId?: string,
  voiceSettings?: DeliverySpec["elevenlabs"]
) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API Key is missing.");
  }

  // Use provided voiceId or default to Rachel
  const VOICE_ID = voiceId || "21m00Tcm4TlvDq8ikWAM";
  const settings = voiceSettings ?? DEFAULT_VOICE_SETTINGS;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarityBoost,
            // Only sent when the profile declares one, so a caller with no opinion on
            // exaggeration reaches the API in exactly the shape it did before this
            // parameter existed.
            ...(settings.style !== undefined ? { style: settings.style } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API Error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Save to public/audio directory for prototype
    const publicAudioDir = path.join(process.cwd(), "public", "audio");
    const fileName = `${sceneId}.mp3`;
    const filePath = path.join(publicAudioDir, fileName);
    
    // Ensure public/audio dir exists
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }

    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    // Return the relative URL to be saved in DB
    return { success: true, audioUrl: `/audio/${fileName}` };
  } catch (error) {
    console.error("Error generating speech:", error);
    return { success: false, error: (error as Error).message };
  }
}
