"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript } from "@/lib/ai/script-writer";
import { sliceScriptIntoScenes } from "@/app/actions/slicer-actions";

export async function createAndGenerateVideo(
  workspaceId: string, 
  workspaceTheme: string,
  workspaceAesthetic: string,
  formData: FormData
) {
  const topic = formData.get("topic") as string;
  const narrativeArc = formData.get("narrative_arc") as string;
  const scriptHook = formData.get("script_hook") as string;
  const visualAesthetic = (formData.get("visual_aesthetic") as string) || workspaceAesthetic;
  
  if (!topic) return { success: false, error: "Topic is required" };

  const supabaseAdmin = await createClient(); 

  // Handle Image Uploads (Ignoring for now unless you want full storage configured)
  // We'll skip the upload part here to ensure it doesn't fail if the bucket isn't setup.
  
  // Generate Script using AI
  const aiResult = await generateScript({
    topic,
    narrativeArc,
    hook: scriptHook,
    visualAesthetic: visualAesthetic || "Cinematic",
    pov: "Third-person omnipresent"
  });

  const masterScript = aiResult.success && aiResult.scriptLines 
    ? aiResult.scriptLines.join("\n\n") 
    : null;

  const status = masterScript ? 'completed' : 'pending';

  // Save to Database
  const { data: project, error } = await supabaseAdmin.from('video_projects').insert([
    {
      workspace_id: workspaceId,
      topic: topic,
      narrative_arc: narrativeArc,
      story_hook: scriptHook,
      visual_aesthetic: visualAesthetic,
      status: status,
      master_script: masterScript
    }
  ]).select().single();

  if (error) {
    console.error("Error creating video project:", error);
    return { success: false, error: error.message };
  }

  // === STEP 1: THE SLICER ===
  // Call our new OpenAI-powered Slicer Agent to intelligently chop the script
  if (masterScript && project) {
    const slicerResult = await sliceScriptIntoScenes(project.id, masterScript);
    
    if (!slicerResult.success) {
      console.error("Error slicing scenes:", slicerResult.error);
    }
  }

  return { success: true, projectId: project.id, masterScript: masterScript };
}
