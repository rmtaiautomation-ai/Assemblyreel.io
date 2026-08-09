import { generateObject } from 'ai';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We instantiate the Google provider with the user's specific env var name
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SceneSchema = z.object({
  scenes: z.array(
    z.object({
      sceneNumber: z.number().describe("Sequential order of the scene starting at 1."),
      voiceOverText: z.string().describe("The exact text chunk from the original script to be spoken. Must match the original script word-for-word without skipping anything."),
      visualPrompt: z.string().describe("A highly detailed cinematic prompt for an AI video generator describing what we see while this text is spoken."),
      estimatedDurationSeconds: z.number().describe("Rough estimate of how long this text takes to speak (approx. 2.5 words per second)."),
      mediaType: z.enum(['video', 'image']).describe("Default to 'video' for dynamic scenes, use 'image' only if the scene requires a static graphic like a chart or map."),
    })
  )
});

async function runTest() {
  const fullScript = `The Book of Enoch reveals a forbidden history. Long ago, 200 fallen angels descended upon Mount Hermon. They traded heavenly secrets for earthly desires, teaching mankind the art of war, the forging of weapons, and the reading of stars. For this ultimate betrayal, they were bound in the depths of the earth, waiting for the final judgment.`;

  console.log("Input Script:\n", fullScript);
  console.log("\nSending to Gemini Slicer Agent...\n");

  try {
    const { object } = await generateObject({
      model: google('gemini-2.5-pro'),
      schema: SceneSchema,
      prompt: `
        You are an expert video editor and cinematic director. 
        Take the following script and slice it into visual scenes for an AI Video Generation pipeline.
        
        RULES:
        1. Every scene should ideally be between 4 and 8 seconds long.
        2. Cut the scene whenever the visual subject needs to change.
        3. The combined 'voiceOverText' for all scenes MUST exactly equal the original script. Do not summarize or alter the text.
        4. Write a vivid, cinematic 'visualPrompt' for each scene that perfectly matches the mood of the narration.

        SCRIPT TO SLICE:
        """
        ${fullScript}
        """
      `,
    });

    console.log("✅ Success! Gemini returned the following Structured JSON:\n");
    console.log(JSON.stringify(object.scenes, null, 2));

  } catch (error) {
    console.error("❌ Slicer Failed:", error);
  }
}

runTest();
