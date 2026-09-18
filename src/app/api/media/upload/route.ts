import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createMediaRecord } from "@/app/actions/media-actions";
import { uploadBufferToSupabase } from "@/lib/supabase/storage";

function guessMediaType(mimeType: string): "video" | "image" | "audio" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file || !projectId) {
      return NextResponse.json({ success: false, error: "Missing file or projectId" }, { status: 400 });
    }

    const mediaId = crypto.randomUUID();
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const fileName = `${mediaId}.${ext}`;
    const storagePath = `uploads/${projectId}/${fileName}`;
    
    const buffer = Buffer.from(await file.arrayBuffer());
    // Background upload to Supabase
    uploadBufferToSupabase(buffer, "media", storagePath, file.type).catch(err => {
      console.error("[/api/media/upload] Supabase upload failed:", err);
    });

    // Save locally for UI playback
    const localPath = path.join(process.cwd(), "public", "media", "uploads", projectId, fileName);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);

    const localUrl = `/media/uploads/${projectId}/${fileName}`;

    const result = await createMediaRecord(projectId, {
      media_type: guessMediaType(file.type),
      source: "upload",
      status: "ready",
      storage_path: storagePath,
      url: localUrl,
      original_filename: file.name,
    });

    if (!result.success || !result.media) {
      return NextResponse.json({ success: false, error: result.error || "Failed to create media record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, mediaId: result.media.id, url: localUrl });
  } catch (error: any) {
    console.error("[/api/media/upload] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Upload failed" }, { status: 500 });
  }
}
