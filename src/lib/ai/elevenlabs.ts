"use server";

import fs from "fs";
import path from "path";

export async function generateSceneSpeech(text: string, sceneId: string, voiceId?: string) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API Key is missing.");
  }

  // Use provided voiceId or default to Rachel
  const VOICE_ID = voiceId || "21m00Tcm4TlvDq8ikWAM"; 

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
            stability: 0.5,
            similarity_boost: 0.5,
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
