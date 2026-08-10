"use server";

import { createClient } from "@/lib/supabase/server";
import { createAndGenerateVideo } from "./video-actions";
import { generateFullNarration } from "./audio-actions";

export async function executeFullPipeline(
  workspaceId: string,
  workspaceTheme: string,
  workspaceAesthetic: string,
  formData: FormData
) {
  // 1. Generate Script, Slice into Scenes, and Orchestrate (Enrich with Prompts)
  const videoRes = await createAndGenerateVideo(
    workspaceId,
    workspaceTheme,
    workspaceAesthetic,
    formData
  );

  if (!videoRes.success || !videoRes.projectId) {
    return videoRes;
  }

  const projectId = videoRes.projectId;
  const supabase = await createClient();

  // 2. Fetch the newly created scenes to generate narration
  const { data: scenes, error: scenesError } = await supabase
    .from("scenes")
    .select("id, voice_over_beat, final_video_prompt")
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: true });

  if (scenesError || !scenes) {
    return { success: false, error: "Failed to fetch scenes for narration." };
  }

  // 3. Generate Full Narration and Align Timestamps via Deepgram
  const audioRes = await generateFullNarration(projectId, scenes);

  // 4. (Optional here) B-Roll Generation
  // Currently, the timeline UI or a background job would pick up the scenes and call /api/media/generate.
  // For a true synchronous single-click, we would trigger the media provider here.
  // However, video generation via Fal.ai can take a long time, so it's typically polled by the client.

  return { 
    success: true, 
    projectId, 
    warnings: [...(videoRes.warnings || []), ...(audioRes.persistWarning ? [audioRes.persistWarning] : [])] 
  };
}
