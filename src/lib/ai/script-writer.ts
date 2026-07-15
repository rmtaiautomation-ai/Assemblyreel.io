"use server";

import { GoogleGenAI, Type, Schema } from "@google/genai";

export async function generateScript(params: {
  topic: string;
  narrativeArc: string;
  hook: string;
  visualAesthetic: string;
  pov: string;
}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY is missing in environment variables." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const systemInstruction = `
You are an expert Script Writer for a highly visual, cinematic video channel.
Your task is to write a master Voiceover (VO) script based on the provided parameters.

### CRITICAL RULES:
1. Tone: Plain English (NLT Bible style), 8th-grade reading level. Epic, dramatic, and direct.
2. Structure: Exactly 12 to 15 lines (total 160-190 words). 
   - Must follow this 5-part arc: Hook -> Setup -> Escalation -> Divine Turn -> Consequence + CTA.
3. Camera-Ready Rule: EVERY SINGLE LINE MUST state WHO (physical subject), WHAT (physical action), and WHERE (visible location). Do not use abstract concepts or metaphors. Describe what is visibly happening on screen.
4. Money Shot Rule: The final line must combine a visual summary and an explicit Call To Action (CTA): "if you believe [theme], type AMEN and write: [phrase]".
`;

    const prompt = `
Write exactly a 12-15 line Voiceover Script based on this Topic and Story Outline.

Topic: ${params.topic}
Story Outline: ${params.narrativeArc}
Hook: ${params.hook}
Visual Aesthetic: ${params.visualAesthetic}
POV: ${params.pov}

Generate the script adhering strictly to the rules. Return a JSON array where each element is a line of the script.
`;

    const responseSchema: Schema = {
      type: Type.ARRAY,
      description: "Array of script lines, exactly 12-15 items.",
      items: {
        type: Type.STRING,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.7,
      },
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No response generated.");
    }
    
    // The response is a JSON string of an array of strings
    let scriptLines = JSON.parse(outputText) as string[];

    // Clean the script lines to remove AI artifacts (asterisks, double commas, slashes, quotes)
    scriptLines = scriptLines.map(line => {
      return line
        .replace(/[*_]/g, "") // Remove markdown asterisks and underscores
        .replace(/[\\/]/g, "") // Remove BOTH forward slashes and backslashes
        .replace(/["']/g, "") // Remove all quotes (single and double)
        .replace(/,,+/g, ",") // Replace double/triple commas with a single comma
        .replace(/\s+/g, " ") // Normalize multiple spaces into one
        .trim();
    });

    return { success: true, scriptLines };
  } catch (error) {
    console.error("Error generating script:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function generateArcAndHook(topic: string, nicheTheme: string) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return { success: false, error: "GEMINI_API_KEY is missing." };

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `
Based on the niche "${nicheTheme}" and the core topic "${topic}", generate a short Story Outline and a catchy 5-second Script Hook.

The Story Outline should be a 2-3 sentence summary of the plot.
The Script Hook should be 1-2 sentences designed to grab the viewer's attention immediately within the first 3-5 seconds.
`;
    
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        narrativeArc: { type: Type.STRING },
        scriptHook: { type: Type.STRING },
      },
      required: ["narrativeArc", "scriptHook"],
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (!response.text) throw new Error("No response generated");
    
    const data = JSON.parse(response.text) as { narrativeArc: string; scriptHook: string };
    return { success: true, data };
  } catch (error) {
    console.error("Error generating Arc/Hook:", error);
    return { success: false, error: (error as Error).message };
  }
}
