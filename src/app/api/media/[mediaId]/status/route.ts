import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateMediaStatus } from "@/app/actions/media-actions";
import { getProvider } from "@/lib/ai/providers/registry";

export async function GET(req: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;

  if (!mediaId) {
    return NextResponse.json({ success: false, error: "Missing mediaId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: media, error } = await supabase.from("media").select("*").eq("id", mediaId).single();

  if (error || !media) {
    return NextResponse.json({ success: false, error: "Media not found" }, { status: 404 });
  }

  if (media.status !== "generating") {
    return NextResponse.json({
      success: true,
      status: media.status,
      url: media.url,
      error: media.error_message,
      simulated: media.source === "stock-fallback" || media.source === "mock",
      mediaType: media.media_type,
    });
  }

  const provider = media.provider_model ? getProvider(media.provider_model) : null;
  if (!provider?.checkStatus) {
    // Nothing to poll against — surface as-is rather than spinning forever.
    return NextResponse.json({ success: true, status: media.status });
  }

  const result = await provider.checkStatus(media.provider_metadata || {});

  if (result.status === "completed") {
    await updateMediaStatus(mediaId, {
      status: "ready",
      url: result.url,
      duration_seconds: result.durationSeconds,
      ...(result.simulated ? { source: "stock-fallback" } : {}),
    });
    return NextResponse.json({
      success: true,
      status: "ready",
      url: result.url,
      simulated: result.simulated ?? false,
      mediaType: media.media_type,
    });
  }

  if (result.status === "failed") {
    await updateMediaStatus(mediaId, { status: "failed", error_message: result.error });
    return NextResponse.json({ success: true, status: "failed", error: result.error });
  }

  return NextResponse.json({ success: true, status: "generating" });
}
