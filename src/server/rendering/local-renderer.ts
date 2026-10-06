import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import fs from "fs/promises";
import path from "path";
import { cacheRemoteMedia } from "./media-cache";
import { setRenderProgress } from "./render-progress-store";
import type { PreparedRenderPayload } from "./render-payload";

export interface LocalRenderResult {
  success: true;
  mode: "local-remotion";
  projectId: string;
  outputPath: string;
  publicUrl: string;
  message: string;
}

export async function renderLocally(
  projectId: string,
  resolvedPayload: PreparedRenderPayload
): Promise<LocalRenderResult> {
  setRenderProgress(projectId, {
    progress: 0,
    stage: "caching media",
    mode: "local",
    startedAt: Date.now(),
  });

  const origin = new URL(resolvedPayload.audioUrl || "http://localhost").origin;
  const cachedScenes: PreparedRenderPayload["scenes"] = [];

  // Sequential on purpose: unbounded downloads recreate the network pressure
  // this cache is intended to prevent.
  for (const scene of resolvedPayload.scenes) {
    const mediaUrl = await cacheRemoteMedia(scene.mediaUrl, origin);
    cachedScenes.push({ ...scene, mediaUrl });
  }

  const payload = { ...resolvedPayload, scenes: cachedScenes };

  console.log(`[Remotion Render] Starting local render for project ${projectId}...`);
  setRenderProgress(projectId, {
    progress: 0,
    stage: "encoding",
    mode: "local",
    startedAt: Date.now(),
  });

  // This entry path is load-bearing for the Remotion bundle and Lambda deployment.
  const bundleLocation = await bundle({
    entryPoint: path.resolve(process.cwd(), "src/remotion/index.ts"),
    publicDir: path.join(process.cwd(), "public"),
  });

  const compositions = await getCompositions(bundleLocation, { inputProps: payload });
  const composition = compositions.find((candidate) => candidate.id === "MainVideo");
  if (!composition) throw new Error("No composition with the ID MainVideo found");

  const outputDirectory = path.join(process.cwd(), "public", "media", "final_exports");
  await fs.mkdir(outputDirectory, { recursive: true });

  const outputPath = path.join(outputDirectory, `${projectId}.mp4`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: payload,
    onProgress: (progress) => {
      setRenderProgress(projectId, {
        progress: progress.progress,
        stage: progress.stitchStage,
        mode: "local",
        startedAt: Date.now(),
      });
    },
  });

  const publicUrl = `/media/final_exports/${projectId}.mp4`;
  setRenderProgress(projectId, {
    progress: 1,
    stage: "done",
    mode: "local",
    outputUrl: publicUrl,
    startedAt: Date.now(),
  });
  console.log(`[Remotion Render] Render completed for project ${projectId}. Saved to ${outputPath}`);

  return {
    success: true,
    mode: "local-remotion",
    projectId,
    outputPath,
    publicUrl,
    message: "Video rendered successfully with Remotion.",
  };
}
