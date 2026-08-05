"use server";

import { generateObject } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';

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

export async function sliceScriptIntoScenes(projectId: string, fullScript: string) {
  try {
    console.log(`[Slicer Agent] Starting slice for project ${projectId}...`);
    
    // Call OpenAI via Vercel AI SDK to get structured JSON
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
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

    const slicedScenes = object.scenes;
    console.log(`[Slicer Agent] Successfully sliced into ${slicedScenes.length} scenes.`);

    const supabase = await createClient();
    
    // Format the data to match your Supabase schema
    const scenesToInsert = slicedScenes.map((scene) => ({
      project_id: projectId,
      sequence_number: scene.sceneNumber,
      voice_over_beat: scene.voiceOverText,
      final_video_prompt: scene.visualPrompt,
      video_duration: scene.estimatedDurationSeconds,
      custom_media_type: scene.mediaType,
      generation_status: 'Pending'
    }));

    // Insert all scenes into the database in one bulk operation
    const { error: insertError } = await supabase
      .from('scenes')
      .insert(scenesToInsert);

    if (insertError) {
      console.error("[Slicer Agent] Database insertion error:", insertError);
      return { success: false, error: "Failed to save scenes to database" };
    }

    return { success: true, scenes: slicedScenes };
    
  } catch (error) {
    console.error("[Slicer Agent] Error slicing script:", error);
    return { success: false, error: (error as Error).message };
  }
}
