import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import path from "path";
import os from "os";

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
    const resolvedPayload = {
      ...payload,
      scenes: payload.scenes.map((scene: any) => {
        let finalMediaUrl = scene.mediaUrl;
        if (finalMediaUrl?.startsWith('/')) {
          finalMediaUrl = `${origin}${scene.mediaUrl}`;
        } else if (finalMediaUrl?.includes('commondatastorage.googleapis.com/gtv-videos-bucket')) {
          finalMediaUrl = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
        }
        return {
          ...scene,
          mediaUrl: finalMediaUrl,
        };
      }),
      audioUrl: payload.audioUrl?.startsWith('/') ? `${origin}${payload.audioUrl}` : payload.audioUrl,
    };

    console.log(`[Remotion Render] Starting local render for project ${payload.projectId}...`);

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
    const outputDir = path.join(os.tmpdir(), "remotion-renders");
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
    });

    console.log(`[Remotion Render] Render completed for project ${resolvedPayload.projectId}. Saved to ${outputPath}`);

    return NextResponse.json({
      success: true,
      mode: "local-remotion",
      projectId: payload.projectId,
      outputPath: outputPath,
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
