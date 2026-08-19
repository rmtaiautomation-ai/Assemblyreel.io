"use server";

import { createClient } from "@/lib/supabase/server";
import { generateSceneSpeech } from "@/lib/ai/elevenlabs";
import { generateLocalSceneSpeech } from "@/lib/ai/local-tts";

/**
 * Separator inserted between two scenes' voiceover text before synthesis.
 *
 * Was a single space, while the comment above it claimed "a natural pause between
 * each" — and the alignment below actively depends on that pause existing (it derives
 * a scene's duration from the gap to the next scene's first word, which "natively
 * includes the TTS engine's silent pause"). With a plain space there was no pause to
 * include, so every scene ran straight into the next one.
 *
 * A blank line is the minimal fix: it reads as a paragraph break to the TTS engine, so
 * it produces a real beat, and it adds no words for the aligner to trip over.
 */
const SCENE_SEPARATOR = "\n\n";

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

/* -------------------------------------------------------------------------- */
/*                          Shared narration primitives                        */
/* -------------------------------------------------------------------------- */

/** Provider-neutral word timing, relative to the start of its own audio file. */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface NarrationAlignment {
  /** Every word in the file, in order. */
  captionWords: CaptionWord[];
  /** Real on-screen duration for each scene, derived from the transcript. */
  sceneDurations: Array<{ id: string; video_duration: number }>;
  /** Total length of the audio file in seconds. */
  totalDurationSeconds: number;
}

type NarrationScene = { id: string; voice_over_beat: string };

interface SynthesisResult {
  success: boolean;
  audioUrl?: string;
  alignment?: NarrationAlignment;
  error?: string;
  alignmentWarning?: string;
}

/**
 * Synthesises one block of narration and returns its word timings and per-scene
 * durations. Does not touch the database.
 *
 * Extracted from `generateFullNarration`, where it was inline and implicitly scoped to
 * "every scene in the project". Per-Act narration needs exactly this logic applied to a
 * subset and — critically — needs the word cursor to *restart* for each call. The old
 * single-pass version walked one cursor across ~150 scenes with a ±5-word search
 * window, so a single mismatch (a dropped word, or "1945" spoken as "nineteen forty
 * five") shifted every subsequent scene with no way to resync. Calling this once per
 * Act caps that blast radius at one Act.
 */
async function synthesizeAndAlign(
  scenes: NarrationScene[],
  fileId: string,
  voiceId?: string
): Promise<SynthesisResult> {
  const script = scenes
    .map((s) => s.voice_over_beat?.trim())
    .filter(Boolean)
    .join(SCENE_SEPARATOR);

  if (!script) {
    return { success: false, error: "All scenes have empty voiceover text" };
  }

  const provider = process.env.TTS_PROVIDER || "local";
  const result =
    provider === "local"
      ? await generateLocalSceneSpeech(script, fileId, voiceId)
      : await generateSceneSpeech(script, fileId, voiceId);

  if (!result.success || !result.audioUrl) {
    return { success: false, error: result.error || "Failed to generate narration" };
  }

  // Alignment is a best-effort enhancement: without it the audio is still usable, the
  // scenes just keep their estimated durations. Never fail the synthesis over it.
  try {
    const alignment = await alignAudioToScenes(result.audioUrl, scenes);
    return { success: true, audioUrl: result.audioUrl, alignment };
  } catch (err) {
    console.error("[Narration] Alignment failed:", err);
    return {
      success: true,
      audioUrl: result.audioUrl,
      alignmentWarning: (err as Error).message,
    };
  }
}

type DeepgramWord = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
};

/**
 * Transcribes a narration file and maps its words back onto the scenes that produced
 * it. Throws on failure so the caller can decide whether that is fatal.
 */
async function alignAudioToScenes(
  audioUrl: string,
  scenes: NarrationScene[]
): Promise<NarrationAlignment> {
  const { createClient: createDeepgramClient } = require("@deepgram/sdk");
  const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY!);
  const fs = require("fs");
  const path = require("path");

  const fileName = audioUrl.split("/").pop();
  const filePath = path.join(process.cwd(), "public", "audio", fileName!);
  const audioBuffer = fs.readFileSync(filePath);

  const { result: dgResult, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
    audioBuffer,
    { model: "nova-2", smart_format: true }
  );

  if (dgError) throw dgError;

  const words = dgResult.results.channels[0].alternatives[0].words as DeepgramWord[];

  // `punctuated_word` is preferred because captions should read as written language,
  // not as raw tokens.
  const captionWords: CaptionWord[] = words.map((w) => ({
    text: w.punctuated_word ?? w.word,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
  }));

  // --- Map words back onto scenes ---
  let currentWordIndex = 0;
  const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

  const sceneWordMatches: { sceneId: string; startWord: DeepgramWord; endWord: DeepgramWord }[] = [];

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
    // Search window: -5 to +5 words to find the exact matching last word.
    for (let i = Math.max(currentWordIndex, targetIndex - 5); i <= Math.min(words.length - 1, targetIndex + 5); i++) {
      if (cleanWord(words[i].word) === expectedLastWord) {
        bestIndex = i;
        break;
      }
    }

    sceneWordMatches.push({ sceneId: scene.id, startWord, endWord: words[bestIndex] });
    currentWordIndex = bestIndex + 1;
  }

  const sceneDurations: Array<{ id: string; video_duration: number }> = [];

  for (let i = 0; i < sceneWordMatches.length; i++) {
    const match = sceneWordMatches[i];
    const nextMatch = sceneWordMatches[i + 1];

    // Span exactly from the start of this scene to the start of the next, which
    // natively includes the TTS engine's silent pause between them.
    const durationRaw = nextMatch
      ? nextMatch.startWord.start - match.startWord.start
      : match.endWord.end - match.startWord.start + 0.3;

    sceneDurations.push({
      id: match.sceneId,
      video_duration: Number(Math.max(0.5, durationRaw).toFixed(2)),
    });
  }

  const lastWord = words[words.length - 1];
  const totalDurationSeconds = lastWord ? Number((lastWord.end + 0.3).toFixed(2)) : 0;

  return { captionWords, sceneDurations, totalDurationSeconds };
}

/** Writes aligned durations back to the scenes table. */
async function persistSceneDurations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sceneDurations: Array<{ id: string; video_duration: number }>
) {
  for (const { id, video_duration } of sceneDurations) {
    const { error } = await supabase.from("scenes").update({ video_duration }).eq("id", id);
    if (error) {
      console.error(`[Narration] Failed to persist video_duration for scene ${id}:`, error.message);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                             Per-Act narration                               */
/* -------------------------------------------------------------------------- */

export interface ActNarration {
  actNumber: number;
  audioUrl: string;
  durationSeconds: number;
  startSeconds: number;
}

export interface GenerateActNarrationResult {
  success: boolean;
  narration?: ActNarration;
  warnings: string[];
  error?: string;
}

/**
 * Records ONE act's narration and aligns only that act's scenes.
 *
 * Everything the user has not touched is left strictly alone: no other act's audio is
 * re-synthesised, re-transcribed, or even read. That is the whole point — editing a
 * word in Act 5 of a 25-minute video previously re-recorded all 25 minutes and re-timed
 * every scene in the project, including the ~130 in acts the user never opened.
 *
 * Safe to call repeatedly for the same act: the row is upserted on
 * (project_id, act_number), so a re-record replaces rather than appends.
 */
export async function generateActNarration(
  projectId: string,
  actNumber: number,
  voiceId?: string
): Promise<GenerateActNarrationResult> {
  if (!projectId) return { success: false, warnings: [], error: "Missing projectId" };

  const supabase = await createClient();
  const warnings: string[] = [];

  const { data: rows, error: fetchError } = await supabase
    .from("scenes")
    .select("id, voice_over_beat")
    .eq("project_id", projectId)
    .eq("act_number", actNumber)
    .order("sequence_number", { ascending: true });

  if (fetchError) {
    // act_number comes from db/add-act-persistence.sql. Without it there is no way to
    // tell which scenes belong to this act, so this cannot degrade gracefully the way
    // reads elsewhere do — narrating the wrong scenes would be worse than failing.
    return {
      success: false,
      warnings,
      error: `Could not read this act's scenes (${fetchError.message}). Run db/add-act-persistence.sql if you haven't yet.`,
    };
  }

  const scenes = (rows ?? []) as NarrationScene[];
  if (scenes.length === 0) {
    return { success: false, warnings, error: `Act ${actNumber} has no scenes to narrate.` };
  }

  const fileId = `project-${projectId}-act-${actNumber}`;
  const synth = await synthesizeAndAlign(scenes, fileId, voiceId);

  if (!synth.success || !synth.audioUrl) {
    return { success: false, warnings, error: synth.error || "Failed to generate narration" };
  }

  if (synth.alignmentWarning) {
    warnings.push(
      `Act ${actNumber} narration was generated, but timing alignment failed (${synth.alignmentWarning}). Its scenes keep their estimated durations.`
    );
  }

  if (synth.alignment) {
    await persistSceneDurations(supabase, synth.alignment.sceneDurations);
  }

  const durationSeconds = synth.alignment?.totalDurationSeconds ?? 0;

  const { error: upsertError } = await supabase.from("act_narrations").upsert(
    {
      project_id: projectId,
      act_number: actNumber,
      audio_url: synth.audioUrl,
      duration_seconds: durationSeconds,
      word_timings: synth.alignment?.captionWords ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,act_number" }
  );

  if (upsertError) {
    return {
      success: false,
      warnings,
      error: `Act ${actNumber} narration was generated but could not be saved (${upsertError.message}). Run db/add-act-narration.sql if you haven't yet.`,
    };
  }

  return {
    success: true,
    narration: { actNumber, audioUrl: synth.audioUrl, durationSeconds, startSeconds: 0 },
    warnings,
  };
}

export interface ActLayoutResult {
  success: boolean;
  acts: ActNarration[];
  totalDurationSeconds: number;
  warnings: string[];
  error?: string;
}

/**
 * Recomputes where each act sits on the timeline, and rebuilds the project-level
 * caption track from the per-act word timings.
 *
 * Pure bookkeeping — no audio is re-encoded and no provider is called. An act that
 * comes back longer after a re-record simply pushes the acts after it later; their own
 * audio and their own internal scene durations are untouched, which is why a re-record
 * can never disturb a neighbouring act.
 *
 * Word timings are stored act-relative on purpose, so this offset pass is the only
 * thing a ripple has to redo — never a second transcription.
 */
export async function recomputeActLayout(projectId: string): Promise<ActLayoutResult> {
  const supabase = await createClient();
  const warnings: string[] = [];

  const { data: rows, error } = await supabase
    .from("act_narrations")
    .select("act_number, audio_url, duration_seconds, word_timings")
    .eq("project_id", projectId)
    .order("act_number", { ascending: true });

  if (error) {
    return {
      success: false,
      acts: [],
      totalDurationSeconds: 0,
      warnings,
      error: `Could not read act narrations (${error.message}). Run db/add-act-narration.sql if you haven't yet.`,
    };
  }

  const acts: ActNarration[] = [];
  const projectCaptionWords: CaptionWord[] = [];
  let cursorSeconds = 0;

  for (const row of rows ?? []) {
    const durationSeconds = Number(row.duration_seconds ?? 0);
    const startSeconds = Number(cursorSeconds.toFixed(2));

    acts.push({
      actNumber: row.act_number as number,
      audioUrl: row.audio_url as string,
      durationSeconds,
      startSeconds,
    });

    const offsetMs = Math.round(startSeconds * 1000);
    for (const word of ((row.word_timings ?? []) as CaptionWord[])) {
      projectCaptionWords.push({
        text: word.text,
        startMs: word.startMs + offsetMs,
        endMs: word.endMs + offsetMs,
      });
    }

    cursorSeconds += durationSeconds;

    const { error: startError } = await supabase
      .from("act_narrations")
      .update({ start_seconds: startSeconds })
      .eq("project_id", projectId)
      .eq("act_number", row.act_number);

    if (startError) {
      warnings.push(`Act ${row.act_number} start time not saved: ${startError.message}`);
    }
  }

  // Needs db/add-caption-columns.sql; captions are an enhancement, so warn rather than
  // fail the layout the editor depends on.
  const { error: wordsError } = await supabase
    .from("video_projects")
    .update({ narration_words: projectCaptionWords })
    .eq("id", projectId);

  if (wordsError) {
    warnings.push(
      `Caption word timings not saved — run db/add-caption-columns.sql: ${wordsError.message}`
    );
  }

  return {
    success: true,
    acts,
    totalDurationSeconds: Number(cursorSeconds.toFixed(2)),
    warnings,
  };
}

/** Reads the stored act layout without recomputing it. */
export async function getActNarrations(projectId: string): Promise<ActNarration[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("act_narrations")
    .select("act_number, audio_url, duration_seconds, start_seconds")
    .eq("project_id", projectId)
    .order("act_number", { ascending: true });

  if (error) {
    console.warn("[Narration] Could not read act narrations:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    actNumber: row.act_number as number,
    audioUrl: row.audio_url as string,
    durationSeconds: Number(row.duration_seconds ?? 0),
    startSeconds: Number(row.start_seconds ?? 0),
  }));
}

/* -------------------------------------------------------------------------- */
/*                   Full narration (short/mid-form, single pass)              */
/* -------------------------------------------------------------------------- */

/**
 * One continuous narration file for the whole project.
 *
 * Retained for short/mid-form, which is single-pass: a 60-second video has ~8 scenes,
 * so neither the cascading-drift problem nor the cost of re-recording on every edit
 * applies. Long-form goes through `generateActNarration` instead.
 */
export async function generateFullNarration(
  projectId: string,
  scenes: Array<{ id: string; voice_over_beat: string }>,
  voiceId?: string
) {
  if (!projectId || !scenes.length) {
    return { success: false, error: "Missing projectId or scenes" };
  }

  const fileId = `project-${projectId}-narration`;
  const synth = await synthesizeAndAlign(scenes, fileId, voiceId);

  if (!synth.success || !synth.audioUrl) {
    return { success: false, error: synth.error || "Failed to generate narration" };
  }

  const supabase = await createClient();

  // Persist the narration URL immediately — independent of whether alignment succeeded,
  // so a transient alignment failure can never make a successfully-generated narration
  // disappear on next page load.
  const { error: narrationSaveError } = await supabase
    .from("video_projects")
    .update({ narration_url: synth.audioUrl })
    .eq("id", projectId);

  if (narrationSaveError) {
    console.error("[Narration] Failed to persist narration_url:", narrationSaveError.message);
  }

  const persistWarning = narrationSaveError
    ? `Narration generated but failed to save (${narrationSaveError.message}) — it will disappear if you leave this page.`
    : undefined;

  if (!synth.alignment) {
    // Non-fatal: the user still gets their audio, scenes just keep estimated durations.
    return { success: true, audioUrl: synth.audioUrl, persistWarning };
  }

  const { error: wordsSaveError } = await supabase
    .from("video_projects")
    .update({ narration_words: synth.alignment.captionWords })
    .eq("id", projectId);

  if (wordsSaveError) {
    console.warn(
      "[Narration] Caption word timings not saved — run db/add-caption-columns.sql:",
      wordsSaveError.message
    );
  }

  await persistSceneDurations(supabase, synth.alignment.sceneDurations);
  console.log(`[Deepgram] Successfully aligned ${scenes.length} scenes to Master Narration.`);

  return {
    success: true,
    audioUrl: synth.audioUrl,
    updatedScenes: synth.alignment.sceneDurations,
    persistWarning,
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
