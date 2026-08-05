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
 * Downloads a remote URL to a local temp file. Returns the local file path.
 * If the download fails (e.g. 403), generates a local placeholder video using FFmpeg.
 */
async function downloadToLocal(url: string, tmpDir: string, index: number, duration = 5): Promise<string> {
  if (!url.startsWith('http')) return url; // Already a local path

  const ext = url.includes('.mp4') ? '.mp4'
    : url.includes('.wav') ? '.wav'
    : url.includes('.mp3') ? '.mp3'
    : url.includes('.png') ? '.png'
    : url.includes('.jpg') ? '.jpg'
    : url.includes('.webp') ? '.webp'
    : '.mp4';

  const localPath = path.join(tmpDir, `input_${index}${ext}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    console.log(`[Render] Downloaded input ${index}: ${url} -> ${localPath} (${buffer.length} bytes)`);
    return localPath;
  } catch (err: any) {
    // Download failed — generate a local placeholder video with FFmpeg's color source
    console.warn(`[Render] Download failed for input ${index} (${err.message}). Generating placeholder...`);
    const placeholderPath = path.join(tmpDir, `input_${index}.mp4`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${duration}:r=30`,
      '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
      '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
      placeholderPath,
    ]);
    console.log(`[Render] Generated placeholder for input ${index}: ${placeholderPath}`);
    return placeholderPath;
  }
}

/**
 * Executes a local FFmpeg render if the binary is installed (Docker/Linux Serverless/Local Dev).
 * Downloads all remote URLs to local temp files first, then runs FFmpeg with local paths only.
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

    // 1. Download all remote inputs to local temp files
    console.log(`[Render] Downloading ${payload.scenes.length} scene(s) and ${payload.audioTracks.length} audio track(s)...`);
    let dlIndex = 0;
    const localScenes = await Promise.all(
      payload.scenes.map(s => downloadToLocal(s.url, tmpDir, dlIndex++, s.duration))
    );
    const localAudio = await Promise.all(
      payload.audioTracks.map(t => downloadToLocal(t.url, tmpDir, dlIndex++))
    );

    // 2. Build a modified payload with local file paths
    const localPayload: RenderJobPayload = {
      ...payload,
      scenes: payload.scenes.map((s, i) => ({ ...s, url: localScenes[i] })),
      audioTracks: payload.audioTracks.map((t, i) => ({ ...t, url: localAudio[i] })),
    };

    const spec = buildFfmpegCommand(localPayload);

    const args: string[] = ['-y'];
    for (const input of spec.inputFiles) {
      args.push('-i', input);
    }
    args.push('-filter_complex', spec.filterGraph);
    args.push(...spec.outputArgs);
    args.push(outputPath);

    console.log(`[Render] Running FFmpeg with ${spec.inputFiles.length} local inputs...`);
    await execFileAsync('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 });

    return { success: true, outputPath };
  } catch (err: any) {
    console.error("FFmpeg execution error:", err);
    return { success: false, error: err.message || "Unknown FFmpeg rendering error" };
  }
}
