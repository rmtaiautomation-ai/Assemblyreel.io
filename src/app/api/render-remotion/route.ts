import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

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

/**
 * In-memory only — deliberately not a DB table or job queue. This is a
 * single-machine app with one render happening at a time in one browser tab;
 * a module-level map living for the lifetime of the same `next dev` process
 * is all a live progress percentage needs. Keyed by projectId so the GET
 * handler below can be polled while the POST below is still in flight for
 * that project (Node serves both concurrently on the same process/state).
 */
const renderProgress = new Map<string, { progress: number; stage: string }>();

// Polled by the client every ~500ms while a render is in flight (same
// polling shape as GET /api/media/[mediaId]/status) to drive the Export
// tab's live percentage overlay.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });
  }
  const entry = renderProgress.get(projectId);
  return NextResponse.json({ success: true, progress: entry?.progress ?? 0, stage: entry?.stage ?? null });
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

    // Pre-download any remote scene media before encoding starts. Sequential on
    // purpose: firing a hundred downloads at once would recreate the same network
    // storm this step exists to prevent. Cache hits make repeat renders near-instant.
    renderProgress.set(payload.projectId, { progress: 0, stage: "caching media" });

    const cachedScenes: any[] = [];
    for (const scene of payload.scenes) {
      let finalMediaUrl = scene.mediaUrl;
      checkForBlob(finalMediaUrl, `scene ${scene.id}`);
      if (finalMediaUrl?.startsWith('/')) {
        finalMediaUrl = `${origin}${scene.mediaUrl}`;
      } else if (finalMediaUrl?.includes('commondatastorage.googleapis.com/gtv-videos-bucket')) {
        finalMediaUrl = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
      }
      finalMediaUrl = await cacheRemoteMedia(finalMediaUrl, origin);
      cachedScenes.push({ ...scene, mediaUrl: finalMediaUrl });
    }

    const resolvedPayload = {
      ...payload,
      scenes: cachedScenes,
      audioUrl: absolutize(payload.audioUrl),
      audioClips: (payload.audioClips ?? []).map((clip: any) => {
        checkForBlob(clip.src, `audio clip ${clip.id}`);
        return { ...clip, src: absolutize(clip.src) };
      }),
    };

    if (blobUrls.length > 0) {
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

    console.log(`[Remotion Render] Starting local render for project ${payload.projectId}...`);
    renderProgress.set(payload.projectId, { progress: 0, stage: "encoding" });

    // 1. Bundle the Remotion project
    const bundleLocation = await bundle({
      entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
      publicDir: path.join(process.cwd(), "public"),
      // If you have a webpack override, you can pass it here
    });

    // 2. Extract Composition details
    const compositions = await getCompositions(bundleLocation, {
      inputProps: resolvedPayload,
    });
    const composition = compositions.find((c) => c.id === "MainVideo");

    if (!composition) {
      throw new Error("No composition with the ID MainVideo found");
    }

    // 3. Define output location
    const outputDir = path.join(process.cwd(), "public", "media", "final_exports");
    const fs = await import("fs/promises");
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, `${resolvedPayload.projectId}.mp4`);

    // 4. Render Media
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: resolvedPayload,
      onProgress: (p) => {
        renderProgress.set(payload.projectId, { progress: p.progress, stage: p.stitchStage });
      },
    });

    renderProgress.set(payload.projectId, { progress: 1, stage: "done" });
    console.log(`[Remotion Render] Render completed for project ${resolvedPayload.projectId}. Saved to ${outputPath}`);

    return NextResponse.json({
      success: true,
      mode: "local-remotion",
      projectId: payload.projectId,
      outputPath: outputPath,
      publicUrl: `/media/final_exports/${resolvedPayload.projectId}.mp4`,
      message: "Video rendered successfully with Remotion.",
    });
  } catch (error: any) {
    console.error("Remotion Render API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process video render request." },
      { status: 500 }
    );
  }
}
