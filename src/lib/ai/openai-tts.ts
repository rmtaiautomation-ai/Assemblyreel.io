"use server";

import fs from "fs";
import path from "path";
import type { DeliverySpec } from "./format-profile";

/**
 * Narration via OpenAI's `gpt-4o-mini-tts`.
 *
 * Mirrors the signature of `generateSceneSpeech` (ElevenLabs) and
 * `generateLocalSceneSpeech` (Voice Studio) so `audio-actions.ts` can pick a
 * provider at runtime from `TTS_PROVIDER` and pass the same arguments to whichever
 * one it lands on.
 *
 * Model is a single constant on purpose — `gpt-4o-mini-tts` is the testing default
 * (cheap, and steerable in plain English), swap it here once quality matters more
 * than spend.
 */
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";

/** OpenAI's named voices. A saved voice outside this set can't be honoured. */
const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
] as const;

/** Used when the channel has saved no voice, or saved one from another engine. */
const DEFAULT_OPENAI_VOICE = "onyx";

interface ResolvedOpenAIVoice {
  voice: string;
  /**
   * Set when the requested voice could not be used — most often because it belongs
   * to Kokoro or ElevenLabs, not OpenAI. Threaded back up through the narration
   * actions' `warnings` array so a silent substitution is visible in the UI, the
   * same way `local-tts.ts` surfaces its own substitutions.
   */
  warning?: string;
}

function resolveOpenAIVoice(voiceId?: string, fallback?: string): ResolvedOpenAIVoice {
  const wanted = voiceId?.trim().toLowerCase();

  if (wanted && (OPENAI_VOICES as readonly string[]).includes(wanted)) {
    return { voice: wanted };
  }

  const base =
    fallback && (OPENAI_VOICES as readonly string[]).includes(fallback.toLowerCase())
      ? fallback.toLowerCase()
      : DEFAULT_OPENAI_VOICE;

  if (wanted) {
    const warning =
      `Saved voice "${voiceId}" is not an OpenAI voice — used "${base}" instead. ` +
      `Pick one of: ${OPENAI_VOICES.join(", ")} in Settings.`;
    console.warn(`[OpenAI TTS] ${warning}`);
    return { voice: base, warning };
  }

  return { voice: base };
}

export async function generateOpenAISceneSpeech(
  text: string,
  sceneId: string,
  voiceId?: string,
  /** The channel's OpenAI delivery block — voice name and plain-English style direction. */
  delivery?: DeliverySpec["openai"]
) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY is missing." };
  }

  const resolved = resolveOpenAIVoice(voiceId, delivery?.voice);

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        input: text,
        voice: resolved.voice,
        response_format: "mp3",
        // Only sent when the channel declares one — an empty string would still count
        // as a style instruction to the model.
        ...(delivery?.instructions ? { instructions: delivery.instructions } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS Error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();

    const publicAudioDir = path.join(process.cwd(), "public", "audio");
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }

    const fileName = `${sceneId}.mp3`;
    const filePath = path.join(publicAudioDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    return { success: true, audioUrl: `/audio/${fileName}`, voiceWarning: resolved.warning };
  } catch (error) {
    console.error("[OpenAI TTS] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}
