"use server";

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ScriptWriterSchema } from "./schemas";

export async function generateScript(params: {
  topic: string;
  narrativeArc: string;
  hook: string;
  visualAesthetic: string;
  pov: string;
  nicheTheme?: string;
  targetDuration?: string;
  actOutline?: { actNumber: number; description: string };
}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY is missing in environment variables." };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    let lengthRule = "Exactly 12 to 15 lines (total 160-190 words).";
    if (params.targetDuration) {
      const dur = params.targetDuration.toLowerCase();
      if (dur.includes("30-60") || dur.includes("short")) {
        lengthRule = "Exactly 6 to 10 lines (total 75-150 words). Focus on 1 Act structure: Hook -> Core Concept -> Climax/CTA.";
      } else if (dur.includes("2-3") || dur.includes("mid-form short")) {
        lengthRule = "Exactly 20 to 25 lines (total 300-450 words). Focus on 3 Act structure: Hook & Context -> Deep Dive -> Conclusion.";
      } else if (dur.includes("3-5") || dur.includes("4-5") || dur.includes("mid-form long")) {
        lengthRule = "Exactly 35 to 45 lines (total 600-750 words). Focus on 3 Act structure: Hook & Context -> Deep Dive -> Conclusion with extended tension.";
      }
    } else if (params.actOutline) {
      lengthRule = "Exactly 15 to 25 lines (total 300-500 words) strictly for this specific Act.";
    }

    let toneMatrixRule = "Epic, dramatic, and direct.";
    if (params.nicheTheme) {
      const niche = params.nicheTheme.toLowerCase();
      if (niche.includes("mythology") || niche.includes("ancient") || niche.includes("religion")) {
        toneMatrixRule = "Epic, NLT Bible style, grandiose, and poetic scale.";
      } else if (niche.includes("crime") || niche.includes("investigation")) {
        toneMatrixRule = "Grounded, suspenseful, analytical, and gripping.";
      } else if (niche.includes("psychology") || niche.includes("dark")) {
        toneMatrixRule = "Intense, psychological, slow-burn, and thought-provoking.";
      }
    }

    const systemInstruction = `
You are an expert Script Writer for a highly visual, cinematic video channel.
Your task is to write a master Voiceover (VO) script based on the provided parameters.

### CRITICAL RULES:
1. Tone: Plain English, 8th-grade reading level. ${toneMatrixRule}
2. Structure: ${lengthRule}
3. Camera-Ready Rule: EVERY SINGLE LINE MUST state WHO (physical subject), WHAT (physical action), and WHERE (visible location). Do not use abstract concepts or metaphors. Describe what is visibly happening on screen.
4. Money Shot Rule: The final line must combine a visual summary and an explicit Call To Action (CTA).
`;

    let prompt = `
Write a Voiceover Script based on this Topic and Story Outline.

Topic: ${params.topic}
Story Outline: ${params.narrativeArc}
Hook: ${params.hook}
Visual Aesthetic: ${params.visualAesthetic}
POV: ${params.pov}
`;

    if (params.actOutline) {
      prompt += `
IMPORTANT: You are only writing the script for ACT ${params.actOutline.actNumber}.
Act Goal: ${params.actOutline.description}
Do NOT write the entire story. Only cover this specific act!
`;
    }

    prompt += `\nGenerate the script adhering strictly to the rules. Return a JSON array where each element is a line of the script.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: ScriptWriterSchema,
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

export async function generateActOutlines(topic: string, narrativeArc: string, nicheTheme: string, targetDuration: string) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return { success: false, error: "GEMINI_API_KEY is missing." };

  let actCount = 5;
  if (targetDuration.includes("15-20m")) actCount = 7;
  else if (targetDuration.includes("20-25m")) actCount = 9;
  else if (targetDuration.includes("25-30m")) actCount = 11;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `
The user is creating a long-form YouTube video about "${topic}".
Niche/Genre: "${nicheTheme}"
The core narrative arc is: "${narrativeArc}"

Based on the psychology of high-retention YouTube videos for the "${nicheTheme}" niche, break this story down into exactly ${actCount} distinct Acts (Chapters).

Apply psychological pacing and value stacking tailored to this specific niche (e.g., True Crime relies on suspense/red herrings, History relies on contextual hooks/escalation, Motivation relies on emotional peaks).

Structure Rules for a ${actCount}-Act Video:
- Act 1: The "Curiosity Gap" / The Hook (Tell them what they will learn, withhold the answer).
- Act 2: The Setup / Context (Introduce players/conflict without infodumping).
- Acts 3 to ${actCount - 1}: The Escalation & Value Stacking (Introduce a NEW problem, contradiction, or plot twist in EVERY act. Do not just list events chronologically. Make the story evolve).
- Act ${actCount}: The Payoff & Conclusion (Deliver the ultimate answer, moral lesson, and CTA).

Return a JSON array of exactly ${actCount} objects. Each object should have:
- "actNumber" (integer, 1 to ${actCount})
- "title" (string)
- "description" (a 2-3 sentence summary of what must happen in this specific act to maintain high retention).
`;
    
    const responseSchema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          actNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["actNumber", "title", "description"]
      }
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
    
    const acts = JSON.parse(response.text) as { actNumber: number; title: string; description: string }[];
    return { success: true, acts };
  } catch (error) {
    console.error("Error generating acts:", error);
    return { success: false, error: (error as Error).message };
  }
}
