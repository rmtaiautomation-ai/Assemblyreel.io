import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { updateMediaStatus } from "@/app/actions/media-actions";
import { getProvider } from "@/lib/ai/providers/registry";

function guessExtFromUrl(url: string, fallback: string): string {
  const match = /\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/.exec(url);
  return match ? match[1].toLowerCase() : fallback;
}

/**
 * Real async completions (currently: Fal) hand back a URL hosted on the
 * provider's own CDN — nothing in this app has ever kept a copy. That's fine
 * for a quick preview, but a multi-day edit on the same project can outlive
 * whatever retention the provider gives that URL, silently breaking a clip
 * mid-edit with no copy anywhere. Download it once, the same way uploads and
 * Gemini images already persist to public/media/. Best-effort: if the fetch
 * fails, fall back to the provider's URL rather than failing the generation.
 */
async function persistLocally(url: string, projectId: string, mediaId: string, mediaType: string) {
  const ext = guessExtFromUrl(url, mediaType === "video" ? "mp4" : "png");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

  const mediaDir = path.join(process.cwd(), "public", "media", projectId);
  await fs.mkdir(mediaDir, { recursive: true });
  const fileName = `${mediaId}.${ext}`;
  await fs.writeFile(path.join(mediaDir, fileName), Buffer.from(await res.arrayBuffer()));

  return { url: `/media/${projectId}/${fileName}`, storagePath: `media/${projectId}/${fileName}` };
}

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
    let finalUrl = result.url;
    let storagePath: string | undefined;

    if (!result.simulated && finalUrl) {
      try {
        const local = await persistLocally(finalUrl, media.project_id, mediaId, media.media_type);
        finalUrl = local.url;
        storagePath = local.storagePath;
      } catch (err) {
        console.warn(`[media/status] Could not persist ${finalUrl} locally, keeping provider URL:`, err);
      }
    }

    await updateMediaStatus(mediaId, {
      status: "ready",
      url: finalUrl,
      duration_seconds: result.durationSeconds,
      ...(storagePath ? { storage_path: storagePath } : {}),
      ...(result.simulated ? { source: "stock-fallback" } : {}),
    });
    return NextResponse.json({
      success: true,
      status: "ready",
      url: finalUrl,
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
