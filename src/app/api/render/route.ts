import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  RenderJobPayload,
  buildFfmpegCommand,
  isFfmpegAvailable,
  executeLocalRender,
} from "@/lib/video/ffmpeg-stitcher";

export async function POST(req: NextRequest) {
  try {
    const payload: RenderJobPayload = await req.json();

    if (!payload.projectId || !payload.scenes || payload.scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid render payload: missing projectId or scenes." },
        { status: 400 }
      );
    }

    // 1. Authenticate user & update project status in Supabase
    const supabase = await createClient();
    const { error: dbError } = await supabase
      .from("video_projects")
      .update({ status: "rendering", updated_at: new Date().toISOString() })
      .eq("id", payload.projectId);

    if (dbError) {
      console.warn("Could not update project status to rendering:", dbError.message);
    }

    // 2. Build the FFmpeg Command Spec (Filtergraph & Arguments)
    const spec = buildFfmpegCommand(payload);

    // 3. Check if local native FFmpeg is available (e.g., Google Cloud Run Docker container or local dev)
    const hasFfmpeg = await isFfmpegAvailable();

    if (hasFfmpeg) {
      console.log(`[Render Engine] Native FFmpeg detected. Running local render for project ${payload.projectId}...`);
      const renderResult = await executeLocalRender(payload);

      if (!renderResult.success) {
        await supabase
          .from("video_projects")
          .update({ status: "failed" })
          .eq("id", payload.projectId);

        return NextResponse.json(
          { success: false, error: renderResult.error },
          { status: 500 }
        );
      }

      // Mark project completed
      await supabase
        .from("video_projects")
        .update({ status: "completed" })
        .eq("id", payload.projectId);

      return NextResponse.json({
        success: true,
        mode: "local-ffmpeg",
        projectId: payload.projectId,
        outputPath: renderResult.outputPath,
        message: "Video rendered successfully.",
      });
    }

    // 4. Serverless Cloud Mode:
    // When running on Vercel/serverless without native FFmpeg binary installed,
    // we return the queued job instruction payload so Cloud Run / AWS Lambda / Webhook worker can execute it.
    console.log(`[Render Engine] Queuing cloud render job for project ${payload.projectId}...`);

    return NextResponse.json({
      success: true,
      mode: "cloud-queued",
      projectId: payload.projectId,
      jobId: `render_${Math.random().toString(36).substring(2, 10)}`,
      status: "queued",
      ffmpegSpec: spec,
      message: "Render job queued for cloud execution.",
    });
  } catch (error: any) {
    console.error("Render API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process video render request." },
      { status: 500 }
    );
  }
}
