import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface RenderScene {
  id: string;
  url: string;
  duration: number;
  trimStart?: number;
  sequenceNumber: number;
  type?: 'video' | 'image';
}

export interface RenderAudioTrack {
  id: string;
  url: string;
  startTime: number;
  duration: number;
  type: 'voiceover' | 'music';
  volume?: number;
}

export interface RenderJobPayload {
  projectId: string;
  scenes: RenderScene[];
  audioTracks: RenderAudioTrack[];
  resolution: '1080x1920' | '1920x1080' | '1080x1080';
  quality: 'High' | 'Standard' | 'Draft';
  fps?: number;
}

export interface FfmpegCommandSpec {
  inputFiles: string[];
  filterGraph: string;
  outputArgs: string[];
  dimensions: { width: number; height: number };
}

/**
 * Maps resolution string to pixel dimensions
 */
export function getDimensions(resolution: string): { width: number; height: number } {
  switch (resolution) {
    case '1080x1920':
      return { width: 1080, height: 1920 }; // 9:16 Shorts/Reels/TikTok
    case '1080x1080':
      return { width: 1080, height: 1080 }; // 1:1 Square
    case '1920x1080':
    default:
      return { width: 1920, height: 1080 }; // 16:9 Landscape
  }
}

/**
 * Builds the FFmpeg filtergraph and arguments required to stitch scenes and audio tracks.
 */
export function buildFfmpegCommand(payload: RenderJobPayload): FfmpegCommandSpec {
  const { width, height } = getDimensions(payload.resolution);
  const fps = payload.fps || (payload.quality === 'High' ? 60 : 30);

  const inputFiles: string[] = [];
  const filterLines: string[] = [];
  let inputIndex = 0;

  // 1. Process Scene Inputs (V1 Track)
  const sceneVideoLabels: string[] = [];
  const sceneAudioLabels: string[] = [];

  for (let i = 0; i < payload.scenes.length; i++) {
    const scene = payload.scenes[i];
    inputFiles.push(scene.url);
    const idx = inputIndex++;

    const trimStart = scene.trimStart || 0;
    const duration = scene.duration || 5;

    // Scale and pad input to fit exact target resolution without distortion
    const vLabel = `[v${i}]`;
    filterLines.push(
      `[${idx}:v]trim=start=${trimStart}:duration=${duration},setpts=PTS-STARTPTS,` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps}${vLabel}`
    );
    sceneVideoLabels.push(vLabel);

    // Ensure audio stream exists or generate silent audio for the scene duration
    const aLabel = `[a${i}]`;
    filterLines.push(`aevalsrc=0:d=${duration}[silent_${i}]`);
    sceneAudioLabels.push(`[silent_${i}]`);
  }

  // 2. Concatenate all Scene Video Streams
  const concatVideoLabel = '[outv]';
  const concatInputs = sceneVideoLabels.join('');
  filterLines.push(
    `${concatInputs}concat=n=${payload.scenes.length}:v=1:a=0${concatVideoLabel}`
  );

  // 3. Process Extra Audio Tracks (Voiceover A1 & Background Music A2)
  const audioMixLabels: string[] = [];

  for (let j = 0; j < payload.audioTracks.length; j++) {
    const track = payload.audioTracks[j];
    inputFiles.push(track.url);
    const idx = inputIndex++;

    const delayMs = Math.round(track.startTime * 1000);
    const volume = track.volume !== undefined ? track.volume : 1.0;
    const aLabel = `[track_${j}]`;

    filterLines.push(
      `[${idx}:a]volume=${volume},adelay=${delayMs}|${delayMs}${aLabel}`
    );
    audioMixLabels.push(aLabel);
  }

  // 4. Mix Audio streams if present
  let finalAudioLabel = '';
  if (audioMixLabels.length > 0) {
    finalAudioLabel = '[outa]';
    filterLines.push(
      `${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest:dropout_transition=2${finalAudioLabel}`
    );
  } else {
    // If no extra audio tracks, create empty silent track
    finalAudioLabel = '[outa]';
    const totalDuration = payload.scenes.reduce((acc, s) => acc + s.duration, 0);
    filterLines.push(`aevalsrc=0:d=${totalDuration}${finalAudioLabel}`);
  }

  // Determine bitrate based on quality
  let videoBitrate = '4000k';
  if (payload.quality === 'High') videoBitrate = '8000k';
  if (payload.quality === 'Draft') videoBitrate = '2000k';

  const outputArgs = [
    '-map', concatVideoLabel,
    '-map', finalAudioLabel,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-b:v', videoBitrate,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'
  ];

  return {
    inputFiles,
    filterGraph: filterLines.join(';\n'),
    outputArgs,
    dimensions: { width, height }
  };
}

/**
 * Checks if native FFmpeg binary is available in the current environment.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    return stdout.toLowerCase().includes('ffmpeg');
  } catch {
    return false;
  }
}

/**
 * Executes a local FFmpeg render if the binary is installed (Docker/Linux Serverless/Local Dev).
 * Returns the file path of the compiled MP4.
 */
export async function executeLocalRender(payload: RenderJobPayload): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    const hasFfmpeg = await isFfmpegAvailable();
    if (!hasFfmpeg) {
      return {
        success: false,
        error: "Native FFmpeg binary is not installed on this server instance."
      };
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'render-'));
    const outputPath = path.join(tmpDir, `project-${payload.projectId}.mp4`);
    const spec = buildFfmpegCommand(payload);

    const args: string[] = ['-y'];
    for (const input of spec.inputFiles) {
      args.push('-i', input);
    }
    args.push('-filter_complex', spec.filterGraph);
    args.push(...spec.outputArgs);
    args.push(outputPath);

    await execFileAsync('ffmpeg', args);

    return { success: true, outputPath };
  } catch (err: any) {
    console.error("FFmpeg execution error:", err);
    return { success: false, error: err.message || "Unknown FFmpeg rendering error" };
  }
}
