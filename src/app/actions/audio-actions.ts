"use server";

import { createClient } from "@/lib/supabase/server";
import { generateSceneSpeech } from "@/lib/ai/elevenlabs";
import { generateLocalSceneSpeech } from "@/lib/ai/local-tts";

// ─── Single-scene audio (kept for per-scene regeneration) ─────────────────────
export async function generateSceneAudio(sceneId: string, text: string, voiceId?: string) {
  if (!sceneId || !text) {
    return { success: false, error: "Missing sceneId or text" };
  }

  const provider = process.env.TTS_PROVIDER || "local";
  let result: { success: boolean; audioUrl?: string; error?: string };

  if (provider === "local") {
    result = await generateLocalSceneSpeech(text, sceneId, voiceId);
  } else {
    result = await generateSceneSpeech(text, sceneId, voiceId);
  }

  if (!result.success || !result.audioUrl) {
    return { success: false, error: result.error || "Failed to generate audio" };
  }

  const supabase = await createClient();
  const { error: saveError } = await supabase.from("scenes").update({ audio_url: result.audioUrl }).eq("id", sceneId);
  if (saveError) {
    console.error("[Scene Audio] Failed to persist audio_url:", saveError.message);
    return { success: true, audioUrl: result.audioUrl, persistWarning: saveError.message };
  }

  return { success: true, audioUrl: result.audioUrl };
}

// ─── Full narration (one continuous audio file for the whole project) ──────────
export async function generateFullNarration(
  projectId: string,
  scenes: Array<{ id: string; voice_over_beat: string }>,
  voiceId?: string
) {
  if (!projectId || !scenes.length) {
    return { success: false, error: "Missing projectId or scenes" };
  }

  // Concatenate all scene voiceovers with a natural pause between each
  const fullScript = scenes
    .map((s) => s.voice_over_beat?.trim())
    .filter(Boolean)
    .join(" ");

  if (!fullScript) {
    return { success: false, error: "All scenes have empty voiceover text" };
  }

  const fileId = `project-${projectId}-narration`;
  const provider = process.env.TTS_PROVIDER || "local";
  let result: { success: boolean; audioUrl?: string; error?: string };

  if (provider === "local") {
    result = await generateLocalSceneSpeech(fullScript, fileId, voiceId);
  } else {
    // ElevenLabs path — same helper, just no per-scene truncation
    result = await generateSceneSpeech(fullScript, fileId, voiceId);
  }

  if (!result.success || !result.audioUrl) {
    return { success: false, error: result.error || "Failed to generate narration" };
  }

  const supabase = await createClient();

  // Persist the narration URL immediately — independent of whether Deepgram
  // alignment below succeeds, so a transient alignment failure can never make
  // a successfully-generated narration disappear on next page load.
  const { error: narrationSaveError } = await supabase
    .from("video_projects")
    .update({ narration_url: result.audioUrl })
    .eq("id", projectId);

  if (narrationSaveError) {
    console.error("[Narration] Failed to persist narration_url:", narrationSaveError.message);
  }

  // --- DEEPGRAM TRANSCRIPTION & SCENE ALIGNMENT (best-effort enhancement) ---
  try {
    const { createClient: createDeepgramClient } = require('@deepgram/sdk');
    const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY!);
    const fs = require('fs');
    const path = require('path');
    
    // Read the generated audio file
    const fileName = result.audioUrl.split('/').pop();
    const filePath = path.join(process.cwd(), "public", "audio", fileName!);
    const audioBuffer = fs.readFileSync(filePath);

    // Call Deepgram
    const { result: dgResult, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2",
        smart_format: true,
      }
    );

    if (dgError) throw dgError;

    const words = dgResult.results.channels[0].alternatives[0].words;
    
    // Smart Mapping Algorithm
    let currentWordIndex = 0;
    const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

    const sceneUpdates = [];
    const sceneWordMatches: { sceneId: string, startWord: any, endWord: any }[] = [];

    // 1. Identify the exact start and end words for every scene
    for (const scene of scenes) {
      if (!scene.voice_over_beat) continue;
      
      const sceneWords = scene.voice_over_beat.split(/\s+/).filter(Boolean);
      if (sceneWords.length === 0) continue;
      
      const expectedLastWord = cleanWord(sceneWords[sceneWords.length - 1]);
      const startWord = words[currentWordIndex];
      
      if (!startWord) break;

      let targetIndex = currentWordIndex + sceneWords.length - 1;
      if (targetIndex >= words.length) targetIndex = words.length - 1;
      
      let bestIndex = targetIndex;
      // Search window: -5 to +5 words to find the exact matching last word
      for (let i = Math.max(currentWordIndex, targetIndex - 5); i <= Math.min(words.length - 1, targetIndex + 5); i++) {
        if (cleanWord(words[i].word) === expectedLastWord) {
          bestIndex = i;
          break;
        }
      }
      
      sceneWordMatches.push({
        sceneId: scene.id,
        startWord,
        endWord: words[bestIndex]
      });
        
      currentWordIndex = bestIndex + 1;
    }
    
    // 2. Calculate duration INCLUDING the natural pause (buffer) before the next scene
    for (let i = 0; i < sceneWordMatches.length; i++) {
        const match = sceneWordMatches[i];
        const nextMatch = sceneWordMatches[i + 1];
        
        let durationRaw = 0;
        if (nextMatch) {
            // Span exactly from the start of this scene to the start of the next scene
            // This natively includes the TTS engine's silent pause (the "buffer")
            durationRaw = nextMatch.startWord.start - match.startWord.start;
        } else {
            // Last scene gets its own duration plus a slight trailing tail
            durationRaw = match.endWord.end - match.startWord.start + 0.3;
        }
        
        const duration = Number(Math.max(0.5, durationRaw).toFixed(2));

        const { error: durationError } = await supabase
          .from("scenes")
          .update({ video_duration: duration })
          .eq("id", match.sceneId);
        if (durationError) {
          console.error(`[Narration] Failed to persist video_duration for scene ${match.sceneId}:`, durationError.message);
        }

        sceneUpdates.push({ id: match.sceneId, video_duration: duration });
    }
    console.log(`[Deepgram] Successfully aligned ${scenes.length} scenes to Master Narration.`);

    return {
      success: true,
      audioUrl: result.audioUrl,
      updatedScenes: sceneUpdates,
      persistWarning: narrationSaveError
        ? `Narration generated but failed to save (${narrationSaveError.message}) — it will disappear if you leave this page.`
        : undefined,
    };
  } catch (err) {
    console.error("[Deepgram] Error aligning timestamps:", err);
    // Non-fatal: if Deepgram fails, the user still gets their audio file, but scenes remain at default 5s
  }

  return {
    success: true,
    audioUrl: result.audioUrl,
    persistWarning: narrationSaveError
      ? `Narration generated but failed to save (${narrationSaveError.message}) — it will disappear if you leave this page.`
      : undefined,
  };
}

// Define your curated list of voices here. 
// Any voice ID not in this list will be hidden from the UI.
const ALLOWED_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "am_adam",
  "am_michael",
  "am_onyx"
];

export async function getAvailableVoices() {
  try {
    const url = process.env.VOICE_STUDIO_URL || "http://localhost:8880";
    const [configRes, voicesRes] = await Promise.all([
      fetch(`${url}/api/config`, { cache: "no-store" }),
      fetch(`${url}/api/voices`, { cache: "no-store" })
    ]);
    if (!voicesRes.ok) return { success: false, voices: [] };
    const data = await voicesRes.json();
    let voices = data.voices || [];
    if (configRes.ok) {
      const config = await configRes.json();
      if (config.active_engine) {
        // Filter by active engine AND our allowed voices list
        const filtered = voices.filter((v: any) => 
          v.engine === config.active_engine && ALLOWED_VOICES.includes(v.id)
        );
        if (filtered.length > 0) voices = filtered;
      }
    }
    return { success: true, voices };
  } catch (err) {
    console.error("Failed to fetch available voices:", err);
    return { success: false, voices: [] };
  }
}


