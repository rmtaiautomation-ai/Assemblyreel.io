"use server";

import { createClient } from "@/lib/supabase/server";
import { generateSceneSpeech } from "@/lib/ai/elevenlabs";
import { generateLocalSceneSpeech } from "@/lib/ai/local-tts";
import { generateOpenAISceneSpeech } from "@/lib/ai/openai-tts";
import type { DeliverySpec } from "@/lib/ai/format-profile";
import { resolveProjectFormatProfile } from "./format-actions";

/**
 * Picks the narration backend from `TTS_PROVIDER` and calls it with the matching
 * slice of the channel's delivery spec.
 *
 *   "local"      → Voice Studio (Kokoro), the default when the var is unset
 *   "openai"     → OpenAI `gpt-4o-mini-tts`
 *   anything else → ElevenLabs
 *
 * Kept in one place so `generateSceneAudio` and `synthesizeAndAlign` cannot drift
 * apart on which provider a given env value selects.
 */
async function synthesizeSpeech(
  text: string,
  fileId: string,
  voiceId?: string,
  delivery?: DeliverySpec
): Promise<{ success: boolean; audioUrl?: string; error?: string; voiceWarning?: string }> {
  const provider = process.env.TTS_PROVIDER || "local";

  if (provider === "local") {
    return generateLocalSceneSpeech(text, fileId, voiceId, delivery?.localTts);
  }
  if (provider === "openai") {
    return generateOpenAISceneSpeech(text, fileId, voiceId, delivery?.openai);
  }
  return generateSceneSpeech(text, fileId, voiceId, delivery?.elevenlabs);
}

/**
 * Separator inserted between two scenes' voiceover text before synthesis.
 *
 * Was a single space, while the comment above it claimed "a natural pause between
 * each" — and the alignment below actively depends on that pause existing (it derives
 * a scene's duration from the gap to the next scene's first word, which "natively
 * includes the TTS engine's silent pause"). With a plain space there was no pause to
 * include, so every scene ran straight into the next one.
 *
 * A blank line, then a single newline, were both tried next, on the theory that fewer
 * newlines would shrink the gap. Neither changed anything audible, because the theory
 * was wrong for this engine: local-tts.ts talks to Kokoro, and Kokoro's own pipeline
 * call (voice-studio/backend/core/engines/kokoro_engine.py) splits on `split_pattern
 * = r"\n+"` — one newline or ten, it is the same split point, synthesized as a
 * separate independent clip, then glued to its neighbours with a bare
 * `np.concatenate` that adds no silence of its own. The gap a listener hears is two
 * clips' own natural leading/trailing silence stacking on top of each other — a
 * property of splitting into clips at all, not of how many newline characters sit at
 * the split point.
 *
 * A plain space is the actual fix: no newline means Kokoro never splits, so the whole
 * Act is one continuous synthesis pass and consecutive scenes get the pipeline's
 * normal one-clip sentence pacing (a period followed by a capital letter) instead of
 * two independently-rendered clips' silences stacking. This does NOT reintroduce the
 * original space-only bug — that bug predates scenes reliably ending in terminal
 * punctuation; every `voice_over_beat` here already ends with a period, which is what
 * gives Kokoro something to pace a natural pause around within one continuous pass.
 *
 * The alignment below does not need a minimum gap size to keep working: it measures
 * the real elapsed time to the next scene's first word from Deepgram's actual
 * timestamps, whatever that gap turns out to be, rather than assuming any fixed
 * separator produced it.
 */
const SCENE_SEPARATOR = " ";

/**
 * The voice and delivery settings a narration request should actually use.
 *
 * Resolved HERE rather than at each call site, because the call sites were the bug: the
 * channel's `narration_voice_id` has been collected at workspace creation and stored since
 * the schema was written, and the Scene Board's "Generate audio" button called
 * `regenerateActNarration({ projectId, actNumber })` with no voice and no delivery spec at
 * all. Every act therefore fell through to `resolveValidVoice(undefined)` in local-tts.ts,
 * which returns whichever voice the engine happens to list first — so a channel's saved
 * voice was written, displayed on the workspace page, and never once used to synthesise
 * anything. The delivery spec (`localTts.speed`, the ElevenLabs stability the forensic
 * preset sets to 0.85) was dropped the same way.
 *
 * An explicitly supplied argument still wins, so a future per-act voice override needs no
 * change here. Both lookups degrade to undefined rather than throwing: a workspace with no
 * saved voice, or a database predating the column, must still be able to record audio.
 */
async function resolveNarrationSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  voiceId?: string,
  delivery?: DeliverySpec
): Promise<{ voiceId?: string; delivery?: DeliverySpec }> {
  let resolvedVoiceId = voiceId;
  let resolvedDelivery = delivery;

  if (!resolvedVoiceId) {
    try {
      const { data: project } = await supabase
        .from("video_projects")
        .select("workspace_id")
        .eq("id", projectId)
        .single();

      if (project?.workspace_id) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("narration_voice_id")
          .eq("id", project.workspace_id)
          .single();

        resolvedVoiceId = workspace?.narration_voice_id || undefined;
      }
    } catch {
      // Leave undefined — local-tts falls back to the engine's default voice.
    }
  }

  if (!resolvedDelivery) {
    try {
      const profile = await resolveProjectFormatProfile(supabase, projectId);
      resolvedDelivery = profile.delivery;
    } catch {
      // Leave undefined — synthesis keeps the hardcoded defaults it used before.
    }
  }

  return { voiceId: resolvedVoiceId, delivery: resolvedDelivery };
}

// ─── Single-scene audio (kept for per-scene regeneration) ─────────────────────
export async function generateSceneAudio(
  sceneId: string,
  text: string,
  voiceId?: string,
  /** The channel's delivery spec. Optional — absent callers keep today's hardcoded voice. */
  delivery?: DeliverySpec
) {
  if (!sceneId || !text) {
    return { success: false, error: "Missing sceneId or text" };
  }

  const result = await synthesizeSpeech(text, sceneId, voiceId, delivery);

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
  /**
   * How many scenes never got a direct word match and had their duration
   * approximated instead (see `alignAudioToScenes`). Zero means every scene was
   * matched precisely.
   */
  unmatchedSceneCount: number;
}

type NarrationScene = { id: string; voice_over_beat: string };

interface SynthesisResult {
  success: boolean;
  audioUrl?: string;
  alignment?: NarrationAlignment;
  error?: string;
  alignmentWarning?: string;
  /** Set when the resolved voice differs from the one requested — see local-tts.ts. */
  voiceWarning?: string;
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
  voiceId?: string,
  delivery?: DeliverySpec
): Promise<SynthesisResult> {
  const script = scenes
    .map((s) => s.voice_over_beat?.trim())
    .filter(Boolean)
    .join(SCENE_SEPARATOR);

  if (!script) {
    return { success: false, error: "All scenes have empty voiceover text" };
  }

  const result = await synthesizeSpeech(script, fileId, voiceId, delivery);

  if (!result.success || !result.audioUrl) {
    return { success: false, error: result.error || "Failed to generate narration" };
  }

  // Set by the local and OpenAI paths when the requested voice couldn't be honoured;
  // the ElevenLabs path never substitutes, so this stays undefined there.
  const voiceWarning = result.voiceWarning;

  // Alignment is a best-effort enhancement: without it the audio is still usable, the
  // scenes just keep their estimated durations. Never fail the synthesis over it.
  try {
    const alignment = await alignAudioToScenes(result.audioUrl, scenes);
    const alignmentWarning =
      alignment.unmatchedSceneCount > 0
        ? `${alignment.unmatchedSceneCount} of ${scenes.length} scene(s) couldn't be precisely matched to the ` +
          `narration (the transcript ran out of words for them, usually from an earlier mismatch cascading ` +
          `forward) — their timing was approximated from the remaining audio length instead of measured directly.`
        : undefined;
    return { success: true, audioUrl: result.audioUrl, alignment, alignmentWarning, voiceWarning };
  } catch (err) {
    console.error("[Narration] Alignment failed:", err);
    return {
      success: true,
      audioUrl: result.audioUrl,
      alignmentWarning: (err as Error).message,
      voiceWarning,
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

  // A scene falls off `sceneWordMatches` when the transcript runs out of words
  // before every scene got a turn — one mismatch early in the act (a dropped word,
  // "1945" read as "nineteen forty five") shifts the cursor, and everything after
  // it can cascade into never matching at all. Those scenes used to just keep
  // their pre-narration ESTIMATED duration silently — which is exactly what put
  // V1 blocks past the end of the real audio: the estimate has no relationship to
  // how long this take actually ran.
  //
  // Instead, whatever real audio time is left over after the matched scenes
  // (`totalDurationSeconds` minus their combined duration) gets split across the
  // unmatched scenes proportionally to their word count. It is still an estimate,
  // not a real per-scene match — but the Act's total V1 width can no longer run
  // past where its own audio file actually ends, which is the failure the user is
  // actually seeing.
  const matchedIds = new Set(sceneWordMatches.map((m) => m.sceneId));
  const unmatchedScenes = scenes.filter(
    (s) => s.voice_over_beat?.trim() && !matchedIds.has(s.id)
  );

  if (unmatchedScenes.length > 0) {
    const matchedTotal = sceneDurations.reduce((sum, d) => sum + d.video_duration, 0);
    const remainingSeconds = Math.max(0, totalDurationSeconds - matchedTotal);

    const wordCounts = unmatchedScenes.map(
      (s) => s.voice_over_beat!.trim().split(/\s+/).filter(Boolean).length || 1
    );
    const totalUnmatchedWords = wordCounts.reduce((sum, n) => sum + n, 0) || unmatchedScenes.length;

    unmatchedScenes.forEach((scene, i) => {
      const share = remainingSeconds * (wordCounts[i] / totalUnmatchedWords);
      sceneDurations.push({ id: scene.id, video_duration: Number(Math.max(0.5, share).toFixed(2)) });
    });
  }

  return {
    captionWords,
    sceneDurations,
    totalDurationSeconds,
    unmatchedSceneCount: unmatchedScenes.length,
  };
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
  /**
   * Per-scene durations this call just wrote to the `scenes` table. Callers that
   * hold their own client-side copy of `scenes` (the Timeline Editor) need this to
   * patch it directly — `router.refresh()` alone re-fetches the server component's
   * props, but a client component's `useState(initialScenes)` does not re-seed
   * itself from new props, so the UI kept showing pre-alignment durations even
   * after the database was already correct.
   */
  updatedScenes?: Array<{ id: string; video_duration: number }>;
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
  voiceId?: string,
  /** The channel's delivery spec. Optional — absent callers keep today's hardcoded voice. */
  delivery?: DeliverySpec
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

  const settings = await resolveNarrationSettings(supabase, projectId, voiceId, delivery);

  const fileId = `project-${projectId}-act-${actNumber}`;
  const synth = await synthesizeAndAlign(scenes, fileId, settings.voiceId, settings.delivery);

  if (!synth.success || !synth.audioUrl) {
    return { success: false, warnings, error: synth.error || "Failed to generate narration" };
  }

  if (synth.voiceWarning) warnings.push(`Act ${actNumber}: ${synth.voiceWarning}`);

  if (synth.alignmentWarning) {
    // `synth.alignment` still being present here (checked below) means this is the
    // partial case — some scenes were approximated, not that alignment failed
    // outright. Only the fully-failed case (no `alignment` at all, caught in
    // `synthesizeAndAlign`) actually leaves scenes on their pre-narration estimate.
    warnings.push(
      synth.alignment
        ? `Act ${actNumber}: ${synth.alignmentWarning}`
        : `Act ${actNumber} narration was generated, but timing alignment failed (${synth.alignmentWarning}). Its scenes keep their estimated durations.`
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
    updatedScenes: synth.alignment?.sceneDurations,
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
  voiceId?: string,
  /** The channel's delivery spec. Optional — absent callers keep today's hardcoded voice. */
  delivery?: DeliverySpec
) {
  if (!projectId || !scenes.length) {
    return { success: false, error: "Missing projectId or scenes" };
  }

  // Same resolution as the Act path above — short/mid-form must honour the channel's
  // saved voice too, and its caller supplies neither argument either.
  const settingsClient = await createClient();
  const settings = await resolveNarrationSettings(settingsClient, projectId, voiceId, delivery);

  const fileId = `project-${projectId}-narration`;
  const synth = await synthesizeAndAlign(scenes, fileId, settings.voiceId, settings.delivery);

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
