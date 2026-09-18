import { NextRequest, NextResponse } from "next/server";
import { updateMediaStatus } from "@/app/actions/media-actions";
import { getProvider } from "@/lib/ai/providers/registry";
import { uploadBufferToSupabase } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/server";
import fs from "fs/promises";
import path from "path";

function guessExtFromUrl(url: string, fallback: string): string {
  const match = /\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/.exec(url);
  return match ? match[1].toLowerCase() : fallback;
}

async function persistToSupabase(url: string, projectId: string, mediaId: string, mediaType: string) {
  const ext = guessExtFromUrl(url, mediaType === "video" ? "mp4" : "png");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const fileName = `${mediaId}.${ext}`;
  const storagePath = `downloads/${projectId}/${fileName}`;
  const contentType = mediaType === "video" ? "video/mp4" : "image/png";

  // Background upload to Supabase
  uploadBufferToSupabase(buffer, "media", storagePath, contentType).catch(err => {
    console.error("[api/media/status] Supabase upload failed:", err);
  });

  // Save locally for instant UI playback
  const localPath = path.join(process.cwd(), "public", "media", "downloads", projectId, fileName);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);

  const localUrl = `/media/downloads/${projectId}/${fileName}`;

  return { url: localUrl, storagePath };
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
        const persisted = await persistToSupabase(finalUrl, media.project_id, mediaId, media.media_type);
        finalUrl = persisted.url;
        storagePath = persisted.storagePath;
      } catch (err) {
        console.warn(`[media/status] Could not persist ${finalUrl} to Supabase, keeping provider URL:`, err);
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
