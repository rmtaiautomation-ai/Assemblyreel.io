import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { prompt, model = "gemini-3-pro-image" } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not set on the server" }, { status: 500 });
    }

    // Call Google Gemini API (Nano Banana / Imagen 3)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        // Set parameters specific to image generation if supported by the endpoint
        generationConfig: {
          responseMimeType: "image/png"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // Extract base64 image data from Gemini's response
    // The structure typically places the image in candidates[0].content.parts[0].inlineData.data
    const part = data.candidates?.[0]?.content?.parts?.[0];
    if (!part || !part.inlineData || !part.inlineData.data) {
       console.error("Unexpected API response:", JSON.stringify(data).substring(0, 500));
       throw new Error("No image data found in the response from Gemini.");
    }

    const base64Data = part.inlineData.data;
    const mimeType = part.inlineData.mimeType || 'image/png';
    const ext = mimeType.split('/')[1] || 'png';

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Save to public/uploads directory
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `gemini-scene-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, buffer);

    // Return the local URL which FFmpeg can read instantly
    const localUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: localUrl });

  } catch (error: any) {
    console.error("Gemini API image generation failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate image" },
      { status: 500 }
    );
  }
}
