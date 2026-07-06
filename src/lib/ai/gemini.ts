'use server';

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface Scene {
  id: string;
  video_prompt: string;
  transcript: string;
}

export async function generateScript(topic: string, masterPrompt: string): Promise<Scene[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `
    You are an expert video script writer.
    Topic: ${topic}
    Master Prompt (Style Guidelines): ${masterPrompt}
    
    Write a short video script (60-90 seconds) broken down into scenes.
    For each scene, provide:
    1. A detailed image/video generation prompt for the visual (incorporating the Master Prompt).
    2. The exact voiceover transcript for that scene.

    Output the response STRICTLY as a JSON array of objects. 
    Do NOT wrap it in markdown code blocks.
    Example:
    [
      { "id": "scene_1", "video_prompt": "...", "transcript": "..." },
      { "id": "scene_2", "video_prompt": "...", "transcript": "..." }
    ]
  `;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          // Force JSON output
          responseMimeType: "application/json",
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`Failed to generate script: ${response.statusText}`);
    }

    const data = await response.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textOutput) {
      throw new Error("Invalid response format from Gemini API");
    }

    return JSON.parse(textOutput) as Scene[];
  } catch (error) {
    console.error("Error in generateScript:", error);
    throw error;
  }
}
