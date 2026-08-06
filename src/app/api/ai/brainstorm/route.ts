import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { prompt, history, context } = await req.json();
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not found' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Format history for Gemini Context
    let conversationHistory = "";
    if (history && history.length > 0) {
      conversationHistory = history.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join("\n");
    }

    const systemInstruction = `
You are an expert AI Video Co-Writer. The user is brainstorming a video idea for their niche: "${context?.theme || 'General'}".
Help them flesh out their idea by suggesting a strong Topic, Narrative Arc (2-3 sentences), Script Hook (1-2 sentences), and a distinct Visual Aesthetic.
Be concise, creative, and engaging.

IMPORTANT: If you feel the brainstorming has reached a point where you have a solid Topic, Narrative Arc, Hook, and Visual Aesthetic, 
you must include a JSON block at the very end of your response, wrapped in a markdown block like this:

\`\`\`json
{
  "topic": "The exact title/topic",
  "narrativeArc": "The 2-3 sentence outline",
  "scriptHook": "The catchy 1-2 sentence hook",
  "visualAesthetic": "A highly descriptive cinematic visual style (e.g., 'Dark, moody lighting, 35mm film grain, muted colors')"
}
\`\`\`
This JSON block allows the UI to parse it and offer an "Apply to Form" button to the user.
If it's too early to finalize the idea, just respond normally without the JSON block.
`;

    const fullPrompt = `
System Context: ${systemInstruction}

Conversation History:
${conversationHistory}

User's Latest Message: ${prompt}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        temperature: 0.7,
      },
    });

    const reply = response.text || "";

    // Extract JSON block if it exists
    let parsed = null;
    const jsonMatch = reply.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error("Failed to parse JSON block from Gemini output");
      }
    }

    return NextResponse.json({ 
      success: true, 
      reply: reply.replace(/```json\n[\s\S]*?\n```/, '').trim(), // Remove JSON block from the chat output
      parsed 
    });

  } catch (error) {
    console.error('Brainstorm API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
