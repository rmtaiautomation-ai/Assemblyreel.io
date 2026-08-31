import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { isLambdaConfigured } from "@/lib/render/lambda-config";
import { syncPayloadMediaToS3 } from "@/lib/render/s3-sync";
import { startLambdaRender, pollLambdaRenderProgress, type LambdaRenderHandle } from "@/lib/render/lambda-render";

const MEDIA_CACHE_DIR = path.join(process.cwd(), "public", "media", "cache");

/**
 * Pulls a remote asset onto local disk and returns a URL pointing at the local copy.
 *
 * Without this, a scene using a Pexels/Pixabay URL makes Remotion re-fetch that
 * remote file to extract EVERY frame during encoding. Across a hundred scenes that
 * is a sustained storm of range requests over the network, which is what pins the
 * CPU and makes the whole machine crawl during export. Reading from a local file
 * instead removes the bottleneck entirely.
 *
 * Cached by a hash of the URL, so re-rendering the same project — or several scenes
 * that happen to use the same clip — downloads each asset at most once.
 *
 * Local-render path only. The Lambda path (see s3-sync.ts) solves the same
 * problem by uploading to S3 instead, since a Lambda worker has no access to
 * this machine's disk.
 */
async function cacheRemoteMedia(url: string | undefined, origin: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  // Already served by us — it's on local disk behind `public/` already.
  if (url.startsWith(origin)) return url;

  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  let ext = ".mp4";
  try {
    const urlExt = path.extname(new URL(url).pathname);
    if (urlExt && urlExt.length <= 5) ext = urlExt;
  } catch {
    // Unparseable URL — keep the default extension rather than failing the render.
  }

  const fileName = `${hash}${ext}`;
  const filePath = path.join(MEDIA_CACHE_DIR, fileName);
  const localUrl = `${origin}/media/cache/${fileName}`;

  try {
    await fs.access(filePath);
    return localUrl; // Cache hit from an earlier render.
  } catch {
    // Not cached yet — fall through and fetch it.
  }

  try {
    await fs.mkdir(MEDIA_CACHE_DIR, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.writeFile(filePath, Buffer.from(await res.arrayBuffer()));
    return localUrl;
  } catch (err) {
    // Fall back to the remote URL: the render will be slow, but a failed download
    // shouldn't turn into a failed export.
    console.warn(`[Render Cache] Could not cache ${url}:`, err);
    return url;
  }
}

// Basic timeout guard (Phase 5 guardrail) for the two new network-dependent
// steps the Lambda path adds — S3 sync and submitting the Lambda render —
// neither of which existed in the local-only flow. A hang in either previously
// had no ceiling; this turns it into a clear, timely error instead.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface RenderProgressEntry {
  progress: number;
  stage: string;
  mode: "local" | "lambda";
  renderId?: string;
  bucketName?: string;
  outputUrl?: string | null;
  error?: string | null;
  startedAt: number;
}

/**
 * In-memory only — deliberately not a DB table or job queue. This is a
 * single-machine app with one render happening at a time in one browser tab;
 * a module-level map living for the lifetime of the same `next dev` process
 * is all a live progress percentage needs. Keyed by projectId so the GET
 * handler below can be polled while the POST below is still in flight for
 * that project (Node serves both concurrently on the same process/state).
 *
 * Doubles as the Phase 5 in-flight lock: a project is "currently rendering"
 * exactly when it has a non-terminal entry here (stage isn't 'done'/'error').
 * No separate lock structure needed — this map is already the single source
 * of truth for render state, for both the local (POST blocks until finished)
 * and Lambda (POST returns immediately, GET polls to completion) paths.
 */
const renderProgress = new Map<string, RenderProgressEntry>();

// If a render's entry never reaches a terminal stage (dev server hiccup,
// browser tab closed before polling resumed after a Lambda submission), don't
// let that permanently block re-rendering the same project. Generous ceiling —
// well above the plan's <5min long-form render target.
const STALE_RENDER_MS = 40 * 60 * 1000;

function isRenderInFlight(projectId: string): boolean {
  const entry = renderProgress.get(projectId);
  if (!entry) return false;
  if (entry.stage === "done" || entry.stage === "error") return false;
  if (Date.now() - entry.startedAt > STALE_RENDER_MS) return false;
  return true;
}

// Polled by the client every ~500ms while a render is in flight (same
// polling shape as GET /api/media/[mediaId]/status) to drive the Export
// tab's live percentage overlay.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });
  }

  let entry = renderProgress.get(projectId);

  // Lambda progress isn't pushed to us — it has to be pulled from AWS on
  // every poll, unlike the local path where `renderMedia`'s onProgress
  // callback writes straight into this map as the render runs.
  if (entry && entry.mode === "lambda" && entry.stage !== "done" && entry.stage !== "error" && entry.renderId && entry.bucketName) {
    try {
      const handle: LambdaRenderHandle = { renderId: entry.renderId, bucketName: entry.bucketName };
      const result = await pollLambdaRenderProgress(handle);
      entry = {
        ...entry,
        progress: result.progress,
        stage: result.error ? "error" : result.stage,
        outputUrl: result.outputUrl,
        error: result.error,
      };
      renderProgress.set(projectId, entry);
    } catch (err: any) {
      // Transient AWS API hiccup — keep the last known progress rather than
      // failing the whole poll; the next tick tries again.
      console.warn(`[Lambda Render] Progress poll failed for ${projectId}:`, err?.message || err);
    }
  }

  return NextResponse.json({
    success: true,
    progress: entry?.progress ?? 0,
    stage: entry?.stage ?? null,
    mode: entry?.mode ?? "local",
    outputUrl: entry?.outputUrl ?? null,
    error: entry?.error ?? null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    if (!payload.projectId || !payload.scenes || payload.scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid render payload: missing projectId or scenes." },
        { status: 400 }
      );
    }

    const projectId = payload.projectId;

    // Phase 5 guardrail: refuse a second concurrent render of the same project
    // rather than letting two renders race each other or double-spend Lambda time.
    if (isRenderInFlight(projectId)) {
      return NextResponse.json(
        { success: false, error: "A render for this project is already in progress." },
        { status: 409 }
      );
    }

    // Reset progress immediately, before any of the slower setup below. This map is
    // never cleaned up after a render completes, so re-rendering the same project
    // leaves a stale { progress: 1, stage: "done" } sitting here — a client that
    // starts polling the instant it fires the POST would otherwise read that leftover
    // value and briefly display the previous render as already finished.
    renderProgress.set(projectId, { progress: 0, stage: "starting", mode: "local", startedAt: Date.now() });

    const origin = req.nextUrl.origin;

    // The headless renderer runs outside the browser, so root-relative URLs
    // (/media/..., /audio/...) mean nothing to it and must be made absolute.
    const absolutize = (url: string | undefined) =>
      url?.startsWith('/') ? `${origin}${url}` : url;

    // A blob: URL is only valid inside the tab that created it. If one reaches
    // here it cannot be fetched, so fail loudly rather than rendering silence.
    const blobUrls: string[] = [];
    const checkForBlob = (url: string | undefined, label: string) => {
      if (url?.startsWith('blob:')) blobUrls.push(label);
    };

    const normalizedScenes = payload.scenes.map((scene: any) => {
      let mediaUrl = scene.mediaUrl;
      checkForBlob(mediaUrl, `scene ${scene.id}`);
      if (mediaUrl?.startsWith('/')) {
        mediaUrl = `${origin}${scene.mediaUrl}`;
      } else if (mediaUrl?.includes('commondatastorage.googleapis.com/gtv-videos-bucket')) {
        mediaUrl = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
      }
      return { ...scene, mediaUrl };
    });

    (payload.audioClips ?? []).forEach((clip: any) => checkForBlob(clip.src, `audio clip ${clip.id}`));

    if (blobUrls.length > 0) {
      renderProgress.set(projectId, { progress: 0, stage: "error", mode: "local", error: "blob URLs unresolved", startedAt: Date.now() });
      return NextResponse.json(
        {
          success: false,
          error:
            `Cannot render: ${blobUrls.join(', ')} still reference browser-only blob: URLs. ` +
            `Wait for these uploads to finish, then render again.`,
        },
        { status: 400 }
      );
    }

    const basePayload = {
      ...payload,
      scenes: normalizedScenes,
      audioUrl: absolutize(payload.audioUrl),
      audioClips: (payload.audioClips ?? []).map((clip: any) => ({ ...clip, src: absolutize(clip.src) })),
    };

    if (isLambdaConfigured()) {
      return await renderViaLambda(projectId, basePayload, origin);
    }
    return await renderLocally(projectId, basePayload);
  } catch (error: any) {
    console.error("Remotion Render API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process video render request." },
      { status: 500 }
    );
  }
}

/**
 * Phase 3 — submits to Remotion Lambda and returns immediately; the client
 * learns the outcome by polling GET, same shape as the local path but backed
 * by AWS instead of an in-process `renderMedia` call.
 */
async function renderViaLambda(projectId: string, basePayload: any, origin: string) {
  console.log(`[Remotion Render] Starting Lambda render for project ${projectId}...`);
  renderProgress.set(projectId, { progress: 0, stage: "syncing media to s3", mode: "lambda", startedAt: Date.now() });

  let s3Payload: any;
  try {
    s3Payload = await withTimeout(syncPayloadMediaToS3(basePayload, origin), 5 * 60 * 1000, "S3 media sync");
  } catch (err: any) {
    const message = err?.message || "Failed to sync media to S3.";
    renderProgress.set(projectId, { progress: 0, stage: "error", mode: "lambda", error: message, startedAt: Date.now() });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  renderProgress.set(projectId, { progress: 0, stage: "submitting to lambda", mode: "lambda", startedAt: Date.now() });

  let handle: LambdaRenderHandle;
  try {
    handle = await withTimeout(startLambdaRender(s3Payload), 60 * 1000, "Lambda render submission");
  } catch (err: any) {
    const message = err?.message || "Failed to submit render to Lambda.";
    renderProgress.set(projectId, { progress: 0, stage: "error", mode: "lambda", error: message, startedAt: Date.now() });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  renderProgress.set(projectId, {
    progress: 0,
    stage: "rendering",
    mode: "lambda",
    renderId: handle.renderId,
    bucketName: handle.bucketName,
    startedAt: Date.now(),
  });

  console.log(`[Remotion Render] Lambda render ${handle.renderId} submitted for project ${projectId}.`);

  return NextResponse.json({
    success: true,
    mode: "lambda",
    projectId,
    renderId: handle.renderId,
    message: "Render submitted to AWS Lambda. Poll for progress to get the output URL.",
  });
}

/** Pre-existing local render path, unchanged in behavior. */
async function renderLocally(projectId: string, resolvedPayload: any) {
  // Pre-download any remote scene media before encoding starts. Sequential on
  // purpose: firing a hundred downloads at once would recreate the same network
  // storm this step exists to prevent. Cache hits make repeat renders near-instant.
  renderProgress.set(projectId, { progress: 0, stage: "caching media", mode: "local", startedAt: Date.now() });

  const origin = new URL(resolvedPayload.audioUrl || "http://localhost").origin;

  const cachedScenes: any[] = [];
  for (const scene of resolvedPayload.scenes) {
    const finalMediaUrl = await cacheRemoteMedia(scene.mediaUrl, origin);
    cachedScenes.push({ ...scene, mediaUrl: finalMediaUrl });
  }

  const payload = { ...resolvedPayload, scenes: cachedScenes };

  console.log(`[Remotion Render] Starting local render for project ${projectId}...`);
  renderProgress.set(projectId, { progress: 0, stage: "encoding", mode: "local", startedAt: Date.now() });

  // 1. Bundle the Remotion project
  const bundleLocation = await bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    publicDir: path.join(process.cwd(), "public"),
  });

  // 2. Extract Composition details
  const compositions = await getCompositions(bundleLocation, {
    inputProps: payload,
  });
  const composition = compositions.find((c) => c.id === "MainVideo");

  if (!composition) {
    throw new Error("No composition with the ID MainVideo found");
  }

  // 3. Define output location
  const outputDir = path.join(process.cwd(), "public", "media", "final_exports");
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${projectId}.mp4`);

  // 4. Render Media
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: payload,
    onProgress: (p) => {
      renderProgress.set(projectId, { progress: p.progress, stage: p.stitchStage, mode: "local", startedAt: Date.now() });
    },
  });

  const publicUrl = `/media/final_exports/${projectId}.mp4`;
  renderProgress.set(projectId, { progress: 1, stage: "done", mode: "local", outputUrl: publicUrl, startedAt: Date.now() });
  console.log(`[Remotion Render] Render completed for project ${projectId}. Saved to ${outputPath}`);

  return NextResponse.json({
    success: true,
    mode: "local-remotion",
    projectId,
    outputPath,
    publicUrl,
    message: "Video rendered successfully with Remotion.",
  });
}
