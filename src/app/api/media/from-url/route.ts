import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createMediaRecord } from "@/app/actions/media-actions";

/**
 * Downloads a stock-media pick (Pexels/Pixabay CDN URL) onto local disk and
 * records it as a `media` row, mirroring /api/media/upload's storage shape.
 * Called only when the user explicitly approves a pick — not on every
 * thumbnail click — so browsing results doesn't burn storage on rejects.
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
      const urlExt = path.extname(new URL(url).pathname);
      if (urlExt && urlExt.length <= 5) ext = urlExt;
    } catch {
      // Unparseable URL — keep the type-based default extension.
    }

    const mediaId = crypto.randomUUID();
    const mediaDir = path.join(process.cwd(), "public", "media", projectId);
    await fs.mkdir(mediaDir, { recursive: true });

    const fileName = `${mediaId}${ext}`;
    await fs.writeFile(path.join(mediaDir, fileName), buffer);

    const localUrl = `/media/${projectId}/${fileName}`;
    const storagePath = `media/${projectId}/${fileName}`;

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
