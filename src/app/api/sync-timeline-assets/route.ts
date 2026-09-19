import { NextRequest, NextResponse } from "next/server";
import { getStorageClient, uploadBufferToSupabase } from "@/lib/supabase/storage";
import fs from "fs/promises";
import path from "path";

const EXT_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function guessContentType(filePath: string): string {
  return EXT_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const origin = req.nextUrl.origin;

    const scenes = payload.scenes || [];
    const audioClips = payload.audioClips || [];
    const audioUrl = payload.audioUrl;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ success: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }

    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/project-media/`;

    // 1. Gather all local URLs to check
    const localUrlsToCheck = new Set<string>();

    const checkUrl = (url: string | undefined) => {
      if (!url) return;
      if (url.startsWith("/")) {
        localUrlsToCheck.add(url);
      } else if (url.startsWith(origin)) {
        localUrlsToCheck.add(url.slice(origin.length));
      }
    };

    scenes.forEach((scene: any) => checkUrl(scene.mediaUrl));
    audioClips.forEach((clip: any) => checkUrl(clip.src));
    checkUrl(audioUrl);

    if (localUrlsToCheck.size === 0) {
      return NextResponse.json({
        success: true,
        checked: 0,
        uploaded: 0,
        message: "No local assets to sync."
      });
    }

    const results = {
      checked: 0,
      uploaded: 0,
      failed: 0,
      errors: [] as string[],
    };

    // 2. Process each local URL
    for (const relativeUrl of Array.from(localUrlsToCheck)) {
      results.checked++;
      
      let cloudPath = "";
      if (relativeUrl.startsWith("/media/")) {
        cloudPath = relativeUrl.slice("/media/".length);
      } else if (relativeUrl.startsWith("/audio/")) {
        cloudPath = relativeUrl.slice(1);
      } else {
        continue;
      }

      const publicUrl = `${publicPrefix}${cloudPath}`;

      // Fast check if it exists on Supabase (since bucket is public)
      let exists = false;
      try {
        const headRes = await fetch(publicUrl, { method: "HEAD" });
        if (headRes.ok) {
          exists = true;
        }
      } catch (err) {
        // Ignore fetch error, we'll try to upload
      }

      if (!exists) {
        // 3. Needs upload. Read from local disk.
        const localFilePath = path.join(process.cwd(), "public", relativeUrl);
        try {
          const fileBuffer = await fs.readFile(localFilePath);
          const contentType = guessContentType(localFilePath);
          
          const uploadRes = await uploadBufferToSupabase(fileBuffer, "project-media", cloudPath, contentType);
          
          if (uploadRes.error) {
            results.failed++;
            results.errors.push(`Failed to upload ${cloudPath}: ${uploadRes.error}`);
          } else {
            results.uploaded++;
          }
        } catch (readErr: any) {
          results.failed++;
          results.errors.push(`Local file not found or unreadable: ${relativeUrl}`);
        }
      }
    }

    return NextResponse.json({
      success: results.failed === 0,
      ...results,
      message: results.uploaded > 0 ? `Synced ${results.uploaded} missing assets.` : `All ${results.checked} assets were already synced.`
    });

  } catch (err: any) {
    console.error("[Sync Assets API Error]", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
