import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createMediaRecord } from "@/app/actions/media-actions";
import { uploadBufferToSupabase } from "@/lib/supabase/storage";

/**
 * Downloads a stock-media pick (Pexels/Pixabay CDN URL), uploads it to
 * Supabase Storage, and records it as a `media` row. Called only when the
 * user explicitly approves a pick — not on every thumbnail click — so
 * browsing results doesn't burn storage on rejects.
 */
export async function POST(req: NextRequest) {
  try {
    const { url, projectId, mediaType } = await req.json();

    if (!url || !projectId) {
      return NextResponse.json({ success: false, error: "Missing url or projectId" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ success: false, error: "url must be http(s)" }, { status: 400 });
    }

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Source fetch failed (${res.status})` }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    let ext = mediaType === "video" ? ".mp4" : ".jpg";
    try {
      const urlObject = new URL(url);
      const parts = urlObject.pathname.split(".");
      if (parts.length > 1) {
        const urlExt = "." + parts.pop();
        if (urlExt.length <= 5) ext = urlExt;
      }
    } catch {
      // Unparseable URL — keep the type-based default extension.
    }

    const mediaId = crypto.randomUUID();
    const fileName = `${mediaId}${ext}`;
    const storagePath = `downloads/${projectId}/${fileName}`;
    const contentType = mediaType === "video" ? "video/mp4" : "image/jpeg";

    // Background upload to Supabase
    uploadBufferToSupabase(buffer, "media", storagePath, contentType).catch(err => {
      console.error("[/api/media/from-url] Supabase upload failed:", err);
    });

    // Save locally for UI playback
    const localPath = path.join(process.cwd(), "public", "media", "downloads", projectId, fileName);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);

    const localUrl = `/media/downloads/${projectId}/${fileName}`;

    const result = await createMediaRecord(projectId, {
      media_type: mediaType === "video" ? "video" : "image",
      source: "stock",
      status: "ready",
      storage_path: storagePath,
      url: localUrl,
      original_filename: fileName,
    });

    if (!result.success || !result.media) {
      return NextResponse.json({ success: false, error: result.error || "Failed to create media record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, mediaId: result.media.id, url: localUrl });
  } catch (error: any) {
    console.error("[/api/media/from-url] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Download failed" }, { status: 500 });
  }
}
