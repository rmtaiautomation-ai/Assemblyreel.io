import fs from "fs/promises";
import path from "path";
import type { GenerateInput, ProviderResult, VideoProvider } from "./types";

const MODEL = "gemini-3-pro-image";

const REFERENCE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Reads a local, public-relative image URL (see `GenerateInput.referenceImageUrl`) as an inline part. */
async function loadReferenceImagePart(referenceImageUrl: string) {
  const relativePath = referenceImageUrl.replace(/^\/+/, "");
  const absolutePath = path.join(process.cwd(), "public", relativePath);
  const data = await fs.readFile(absolutePath);
  const mimeType = REFERENCE_MIME_TYPES[path.extname(absolutePath).toLowerCase()] ?? "image/png";
  return { inlineData: { mimeType, data: data.toString("base64") } };
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

      const mediaDir = path.join(process.cwd(), "public", "media", input.projectId);
      await fs.mkdir(mediaDir, { recursive: true });
      const fileName = `${input.mediaId}.${ext}`;
      await fs.writeFile(path.join(mediaDir, fileName), buffer);

      return {
        status: "completed",
        url: `/media/${input.projectId}/${fileName}`,
        storagePath: `media/${input.projectId}/${fileName}`,
      };
    } catch (error: any) {
      console.error("Gemini image generation failed:", error);
      return { status: "failed", error: error.message || "Failed to generate image" };
    }
  },
};
