import fs from "fs/promises";
import path from "path";
import type { GenerateInput, ProviderResult, VideoProvider } from "./types";
import { uploadBufferToSupabase } from "@/lib/supabase/storage";

const MODEL = "gemini-3-pro-image";

const REFERENCE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function loadReferenceImagePart(referenceImageUrl: string) {
  if (/^https?:\/\//i.test(referenceImageUrl)) {
    const res = await fetch(referenceImageUrl);
    if (!res.ok) throw new Error(`Could not fetch reference image from ${referenceImageUrl}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    let mimeType = res.headers.get("content-type") || "image/png";
    return { inlineData: { mimeType, data: buffer.toString("base64") } };
  } else {
    const relativePath = referenceImageUrl.replace(/^\/+/, "");
    const absolutePath = path.join(process.cwd(), "public", relativePath);
    const data = await fs.readFile(absolutePath);
    const mimeType = REFERENCE_MIME_TYPES[path.extname(absolutePath).toLowerCase()] ?? "image/png";
    return { inlineData: { mimeType, data: data.toString("base64") } };
  }
}

export const geminiImageProvider: VideoProvider = {
  id: "gemini-image",
  kind: "image",
  async start(input: GenerateInput): Promise<ProviderResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { status: "failed", error: "GEMINI_API_KEY is not set on the server" };
    }

    try {
      const parts: Record<string, unknown>[] = [];
      if (input.referenceImageUrl) {
        parts.push(await loadReferenceImagePart(input.referenceImageUrl));
      }
      parts.push({ text: input.prompt });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "image/png" },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { status: "failed", error: `Gemini API Error (${response.status}): ${errText}` };
      }

      const data = await response.json();
      const part = data.candidates?.[0]?.content?.parts?.[0];
      if (!part?.inlineData?.data) {
        console.error("Unexpected Gemini API response:", JSON.stringify(data).substring(0, 500));
        return { status: "failed", error: "No image data found in the response from Gemini." };
      }

      const base64Data = part.inlineData.data;
      const mimeType = part.inlineData.mimeType || "image/png";
      const ext = mimeType.split("/")[1] || "png";
      const buffer = Buffer.from(base64Data, "base64");

      const fileName = `${input.mediaId}.${ext}`;
      const storagePath = `uploads/${input.projectId}/${fileName}`;
      
      // Background upload to Supabase
      uploadBufferToSupabase(buffer, "media", storagePath, mimeType).catch(err => {
        console.error("[Gemini Image] Supabase upload failed:", err);
      });

      // Save locally for instant UI playback
      const localPath = path.join(process.cwd(), "public", "media", "uploads", input.projectId, fileName);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, buffer);

      const localUrl = `/media/uploads/${input.projectId}/${fileName}`;

      return {
        status: "completed",
        url: localUrl,
        storagePath: storagePath,
      };
    } catch (error: any) {
      console.error("Gemini image generation failed:", error);
      return { status: "failed", error: error.message || "Failed to generate image" };
    }
  },
};
