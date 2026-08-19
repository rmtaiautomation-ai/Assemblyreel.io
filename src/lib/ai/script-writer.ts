"use server";

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ScriptWriterSchema } from "./schemas";
import {
  WORDS_PER_NARRATION_LINE,
  resolveDurationProfile,
  resolveNicheProfile,
} from "./generation-rules";
// These three functions call `@google/genai` directly rather than the Vercel AI SDK,
// but they draw on the same provider quota as every other agent — so they share the
// same throttle.
import { acquireCallSlot } from "./concurrency";

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

    const niche = resolveNicheProfile(params.nicheTheme);
    const duration = resolveDurationProfile(params.targetDuration);

    // An Act request narrows the target to a single chapter, so the whole-video word
    // count does not apply — but a per-Act word budget very much does. Sending only a
    // line count (which is what this did) let the model satisfy the instruction with
    // ~12-word lines, so every long-form tier came in 35-40% under its runtime target
    // no matter which duration the user picked. `wordsPerAct` is pre-divided by
    // actCount in generation-rules.ts.
    const lengthRule = params.actOutline
      ? `Exactly ${duration.targetLineCount.min} to ${duration.targetLineCount.max} lines strictly for this single Act, totalling ${duration.wordsPerAct.min}-${duration.wordsPerAct.max} words. This word count is the hard target — if you are short, write RICHER, more detailed lines rather than more lines.`
      : `Exactly ${duration.targetLineCount.min} to ${duration.targetLineCount.max} lines (total ${duration.targetWordCount.min}-${duration.targetWordCount.max} words). Structure: ${duration.structureRule}`;

    const toneMatrixRule = niche.scriptTone;

    const systemInstruction = `
You are an expert Script Writer for a highly visual, cinematic video channel.
Your task is to write a master Voiceover (VO) script based on the provided parameters.

### CRITICAL RULES:
1. Tone: Plain English, 8th-grade reading level. ${toneMatrixRule}
2. Structure: ${lengthRule}
3. Camera-Ready Rule: EVERY SINGLE LINE MUST state WHO (physical subject), WHAT (physical action), and WHERE (visible location). Do not use abstract concepts or metaphors. Describe what is visibly happening on screen. Aim for roughly ${WORDS_PER_NARRATION_LINE} words per line — long enough to carry real visual detail, not a clipped fragment.
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

    await acquireCallSlot();

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

    await acquireCallSlot();

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

  const { actCount } = resolveDurationProfile(targetDuration);

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

    await acquireCallSlot();

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
