import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createMediaRecord } from "@/app/actions/media-actions";

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
    const mediaDir = path.join(process.cwd(), "public", "media", projectId);
    await fs.mkdir(mediaDir, { recursive: true });

    const fileName = `${mediaId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(mediaDir, fileName), buffer);

    const url = `/media/${projectId}/${fileName}`;
    const storagePath = `media/${projectId}/${fileName}`;

    const result = await createMediaRecord(projectId, {
      media_type: guessMediaType(file.type),
      source: "upload",
      status: "ready",
      storage_path: storagePath,
      url,
      original_filename: file.name,
    });

    if (!result.success || !result.media) {
      return NextResponse.json({ success: false, error: result.error || "Failed to create media record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, mediaId: result.media.id, url });
  } catch (error: any) {
    console.error("[/api/media/upload] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Upload failed" }, { status: 500 });
  }
}
