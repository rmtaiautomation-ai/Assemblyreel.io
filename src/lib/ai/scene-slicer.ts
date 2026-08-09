"use server";

import { GoogleGenAI } from "@google/genai";
import { SceneSlicerSchema } from "./schemas";

export async function sliceScriptIntoScenes(params: {
  scriptLines: string[];
  topic: string;
  visualAesthetic: string;
  nicheTheme?: string;
  targetDuration?: string;
}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY is missing in environment variables." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const fullScript = params.scriptLines.join("\n");

    let pacingRule = "Moderate pacing. Allow the scenes to breathe (4-8 seconds each).";
    if (params.targetDuration) {
      const dur = params.targetDuration.toLowerCase();
      if (dur.includes("30-60") || dur.includes("short")) {
        pacingRule = "Hyper-fast pacing. Slice sentences into very short fragments (2-4 seconds each) for high retention.";
      } else if (dur.includes("2-3") || dur.includes("mid-form short")) {
        pacingRule = "Moderate-fast pacing. Clips change every 4-6 seconds.";
      } else if (dur.includes("3-5") || dur.includes("4-5") || dur.includes("mid-form long")) {
        pacingRule = "Moderate pacing. Clips change every 5-8 seconds to allow for more visual breathing room.";
      } else if (dur.includes("10-") || dur.includes("15-") || dur.includes("20-")) {
        pacingRule = "Slow, cinematic pacing. Clips linger for 6-12 seconds. Do not over-slice.";
      }
    }

    let toneMatrixRule = "";
    if (params.nicheTheme) {
      const niche = params.nicheTheme.toLowerCase();
      if (niche.includes("mythology") || niche.includes("ancient") || niche.includes("religion")) {
        toneMatrixRule = "Favor 'ESTABLISH' and 'DIVINE' scene types for epic scale.";
      } else if (niche.includes("crime") || niche.includes("investigation")) {
        toneMatrixRule = "Favor 'ACTION' and 'DIALOGUE' (close-ups, evidence, tense movement) scene types.";
      } else if (niche.includes("psychology") || niche.includes("dark")) {
        toneMatrixRule = "Favor high contrast, slow camera movements, and subtle 'ESTABLISH' scenes.";
      }
    }

    const systemInstruction = `
You are the Scene B-roll Slicer. Your job is to take a complete Voiceover script and break it down into distinct visual beats (Scenes).

### CRITICAL RULES:
1. Pacing Strategy: ${pacingRule}
2. Tone Overrides: ${toneMatrixRule}
3. Voiceover Exact Match: The 'voiceoverText' you output across all scenes combined MUST EXACTLY MATCH the original script. Do not skip or change any words.
4. Scene Types: Use one of [ESTABLISH, ACTION, DIALOGUE, DIVINE, CLOSEUP, MACRO, WIDE].
5. Organic Slicing: You determine the total number of scenes based on the pacing strategy and the density of the script. Do NOT force an artificial limit, just make the visual flow natural.
`;

    const prompt = `
Topic: ${params.topic}
Visual Aesthetic: ${params.visualAesthetic}
Niche: ${params.nicheTheme || "General"}

Master Script to Slice:
${fullScript}

Slice this script and return the strictly structured JSON array according to the schema.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SceneSlicerSchema,
        temperature: 0.2, // Low temperature for high accuracy on script matching
      },
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No response generated.");
    }
    
    // Output should match the SceneSlicerSchema (array of objects)
    const scenes = JSON.parse(outputText);

    return { success: true, scenes };
  } catch (error) {
    console.error("Error slicing script:", error);
    return { success: false, error: (error as Error).message };
  }
}
