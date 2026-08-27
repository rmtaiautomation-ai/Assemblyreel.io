"use server";

import fs from "fs";
import path from "path";
import type { DeliverySpec } from "./format-profile";

// Voice Studio backend runs on :8880 (FastAPI). The Vite dev UI is on :5173.
const VOICE_STUDIO_URL = process.env.VOICE_STUDIO_URL || "http://localhost:8880";

interface ResolvedVoice {
  voiceId: string;
  /**
   * Set when the requested voice could not actually be honoured — most commonly because
   * it belongs to an engine that isn't the one Voice Studio currently has active. Threaded
   * back up through `generateLocalSceneSpeech` -> `synthesizeAndAlign` -> the narration
   * actions' `warnings` array, so a silent substitution shows up in the UI instead of only
   * a server console line nobody watching the browser would ever see. This is what made a
   * channel's saved voice LOOK ignored: it was substituted every time, with no signal
   * anywhere the user could see.
   */
  warning?: string;
}

async function resolveValidVoice(voiceId?: string): Promise<ResolvedVoice> {
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
        return { voiceId };
      }
      // 2. Otherwise use the first voice for the active engine
      if (engineVoices.length > 0) {
        if (voiceId) {
          const warning =
            `Requested voice "${voiceId}" is not available on Voice Studio's active engine ` +
            `("${activeEngine}") — used "${engineVoices[0].id}" instead. Re-pick a voice in ` +
            `Settings, or switch Voice Studio's active engine to match it.`;
          console.warn(`[Local TTS] ${warning}`);
          return { voiceId: engineVoices[0].id, warning };
        }
        return { voiceId: engineVoices[0].id };
      }
      // 3. Fallback to any matching voice ID
      if (voiceId && voicesData.voices?.some((v: any) => v.id === voiceId)) {
        return { voiceId };
      }
    }
  } catch (err) {
    console.warn("[Local TTS] Could not resolve voice:", err);
  }
  return { voiceId: "af_heart" }; // Fallback to standard Kokoro voice
}

export async function generateLocalSceneSpeech(
  text: string,
  sceneId: string,
  voiceId?: string,
  /**
   * Accepted for call-site symmetry with `generateSceneSpeech` — `audio-actions.ts`
   * picks a provider at runtime via `TTS_PROVIDER` and needs to pass the same
   * `delivery` shape regardless of which one it lands on.
   *
   * NOT YET APPLIED. `SynthRequestBody`'s accepted fields beyond `speakers[].name` and
   * `speakers[].voice` are unconfirmed — Voice Studio is a local FastAPI service this
   * project doesn't build, and implementation_plans/16-long-form-audio-first-pipeline.md
   * already flagged pace as explicitly deferred pending a check of `localhost:8880/docs`.
   * Guessing a field name here risks a strict backend rejecting the whole request, which
   * would break local narration outright. Logged once per call so a channel with a
   * configured pace silently getting the engine default is visible, not hidden.
   */
  delivery?: DeliverySpec["localTts"]
) {
  if (delivery?.speed !== undefined) {
    console.warn(
      `[Local TTS] speed=${delivery.speed} requested but not sent — Voice Studio's accepted fields are unverified. See generateLocalSceneSpeech's doc comment.`
    );
  }

  try {
    const resolved = await resolveValidVoice(voiceId);

    // Voice Studio SynthRequestBody shape (from backend/api/schemas.py)
    // SynthSpeakerModel requires: name (str), voice (str)
    const body = {
      text,
      speakers: [
        {
          name: "Speaker 1",
          voice: resolved.voiceId,
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

    return { success: true, audioUrl: `/audio/${fileName}`, voiceWarning: resolved.warning };
  } catch (error) {
    console.error("[Local TTS] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}
