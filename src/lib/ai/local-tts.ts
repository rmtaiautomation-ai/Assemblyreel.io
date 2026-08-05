"use server";

import fs from "fs";
import path from "path";

// Voice Studio backend runs on :8880 (FastAPI). The Vite dev UI is on :5173.
const VOICE_STUDIO_URL = process.env.VOICE_STUDIO_URL || "http://localhost:8880";

async function resolveValidVoice(voiceId?: string): Promise<string> {
  try {
    const [configRes, voicesRes] = await Promise.all([
      fetch(`${VOICE_STUDIO_URL}/api/config`),
      fetch(`${VOICE_STUDIO_URL}/api/voices`)
    ]);
    if (configRes.ok && voicesRes.ok) {
      const config = await configRes.json();
      const voicesData = await voicesRes.json();
      const activeEngine = config.active_engine;
      const engineVoices = voicesData.voices?.filter((v: any) => v.engine === activeEngine) || [];

      // 1. If voiceId is provided and is valid for the active engine, use it
      if (voiceId && engineVoices.some((v: any) => v.id === voiceId)) {
        return voiceId;
      }
      // 2. Otherwise use the first voice for the active engine
      if (engineVoices.length > 0) {
        return engineVoices[0].id;
      }
      // 3. Fallback to any matching voice ID
      if (voiceId && voicesData.voices?.some((v: any) => v.id === voiceId)) {
        return voiceId;
      }
    }
  } catch (err) {
    console.warn("[Local TTS] Could not resolve voice:", err);
  }
  return "af_heart"; // Fallback to standard Kokoro voice
}

export async function generateLocalSceneSpeech(
  text: string,
  sceneId: string,
  voiceId?: string
) {
  try {
    const selectedVoice = await resolveValidVoice(voiceId);

    // Voice Studio SynthRequestBody shape (from backend/api/schemas.py)
    // SynthSpeakerModel requires: name (str), voice (str)
    const body = {
      text,
      speakers: [
        {
          name: "Speaker 1",
          voice: selectedVoice,
        },
      ],
    };

    const response = await fetch(`${VOICE_STUDIO_URL}/api/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Generous timeout — GPU synthesis can take 10-30s for long text
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voice Studio error ${response.status}: ${err}`);
    }

    // Returns raw audio/wav binary
    const audioBuffer = await response.arrayBuffer();

    const publicAudioDir = path.join(process.cwd(), "public", "audio");
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }

    const fileName = `${sceneId}.wav`;
    const filePath = path.join(publicAudioDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    return { success: true, audioUrl: `/audio/${fileName}` };
  } catch (error) {
    console.error("[Local TTS] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}
