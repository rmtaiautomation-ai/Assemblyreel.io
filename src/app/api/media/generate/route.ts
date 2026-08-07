import { NextRequest, NextResponse } from "next/server";
import { createMediaRecord, updateMediaStatus } from "@/app/actions/media-actions";
import { getProvider, getSourceForModel } from "@/lib/ai/providers/registry";

interface GenerateBody {
  sceneId: string;
  projectId: string;
  prompt: string;
  model: string;
  duration?: number;
  aspectRatio?: string;
}

export async function POST(req: NextRequest) {
  let mediaId: string | undefined;

  try {
    const body: GenerateBody = await req.json();
    const { projectId, prompt, model, duration = 5, aspectRatio = "16:9" } = body;

    if (!projectId || !prompt || !model) {
      return NextResponse.json({ success: false, error: "projectId, prompt, and model are required." }, { status: 400 });
    }

    const provider = getProvider(model);

    // Insert immediately so an id exists even if the provider call throws below.
    const created = await createMediaRecord(projectId, {
      media_type: provider.kind,
      source: getSourceForModel(model),
      status: "generating",
      provider_model: model,
    });

    if (!created.success || !created.media) {
      return NextResponse.json({ success: false, error: created.error || "Failed to create media record" }, { status: 500 });
    }

    mediaId = created.media.id;

    const result = await provider.start({ prompt, durationSeconds: duration, aspectRatio, projectId, mediaId: mediaId! });

    if (result.status === "completed") {
      // A stock placeholder is recorded as such, not as the model the user picked —
      // media.source must not claim a real render happened.
      await updateMediaStatus(mediaId!, {
        status: "ready",
        url: result.url,
        duration_seconds: result.durationSeconds ?? duration,
        ...(result.simulated ? { source: "stock-fallback" } : {}),
      });
      return NextResponse.json({
        success: true,
        mediaId,
        status: "ready",
        url: result.url,
        simulated: result.simulated ?? false,
        mediaType: provider.kind,
      });
    }

    if (result.status === "failed") {
      await updateMediaStatus(mediaId!, { status: "failed", error_message: result.error });
      return NextResponse.json({ success: true, mediaId, status: "failed", error: result.error });
    }

    // pending — leave status='generating', persist provider bookkeeping for the status route to poll with.
    await updateMediaStatus(mediaId!, { status: "generating", provider_metadata: result.providerMetadata });
    return NextResponse.json({ success: true, mediaId, status: "generating" });
  } catch (error: any) {
    console.error("[/api/media/generate] Error:", error);
    if (mediaId) {
      await updateMediaStatus(mediaId, { status: "failed", error_message: error.message || "Generation failed" });
    }
    return NextResponse.json({ success: false, error: error.message || "Failed to generate media." }, { status: 500 });
  }
}
