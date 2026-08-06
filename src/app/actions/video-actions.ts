"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript, generateActOutlines } from "@/lib/ai/script-writer";
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
  const targetDuration = (formData.get("target_duration") as string) || "Short (< 60s)";
  
  if (!topic) return { success: false, error: "Topic is required" };

  const supabaseAdmin = await createClient(); 
  const isLongForm = targetDuration.includes("Long");

  if (isLongForm) {
    // 1. Generate 5-Act Structure (or 7, 9, 11 based on duration and niche)
    const actOutlinesRes = await generateActOutlines(topic, narrativeArc, workspaceTheme, targetDuration);
    if (!actOutlinesRes.success || !actOutlinesRes.acts) {
      return { success: false, error: "Failed to generate Act Outlines for Long-Form video." };
    }
    
    // Save to Database initially with pending status and empty master script
    const { data: project, error } = await supabaseAdmin.from('video_projects').insert([
      {
        workspace_id: workspaceId,
        topic: topic,
        narrative_arc: narrativeArc,
        story_hook: scriptHook,
        visual_aesthetic: visualAesthetic,
        status: 'pending',
        master_script: ""
      }
    ]).select().single();

    if (error || !project) {
      console.error("Error creating video project:", error);
      return { success: false, error: error?.message || "Failed to create project" };
    }

    let combinedScript = "";
    let startingSequenceNumber = 1;

    for (const act of actOutlinesRes.acts) {
      console.log(`[Long-Form] Generating Act ${act.actNumber}...`);
      const aiResult = await generateScript({
        topic,
        narrativeArc,
        hook: scriptHook,
        visualAesthetic: visualAesthetic || "Cinematic",
        pov: "Third-person omnipresent",
        actOutline: act
      });

      if (aiResult.success && aiResult.scriptLines) {
        const actScriptText = aiResult.scriptLines.join("\n\n");
        combinedScript += `\n\n=== ACT ${act.actNumber}: ${act.title} ===\n\n` + actScriptText;
        
        // Slice just this Act
        const slicerResult = await sliceScriptIntoScenes(project.id, actScriptText, startingSequenceNumber);
        if (slicerResult.success && slicerResult.scenes) {
          startingSequenceNumber += slicerResult.scenes.length;
        }
      }
    }

    // Update Project with final master script
    await supabaseAdmin.from('video_projects')
      .update({ status: 'completed', master_script: combinedScript.trim() })
      .eq('id', project.id);

    return { success: true, projectId: project.id, masterScript: combinedScript.trim() };

  } else {
    // STANDARD / SHORT-FORM EXECUTION
    const aiResult = await generateScript({
      topic,
      narrativeArc,
      hook: scriptHook,
      visualAesthetic: visualAesthetic || "Cinematic",
      pov: "Third-person omnipresent",
      targetDuration
    });

    const masterScript = aiResult.success && aiResult.scriptLines 
      ? aiResult.scriptLines.join("\n\n") 
      : null;

    const status = masterScript ? 'completed' : 'pending';

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

    if (error || !project) {
      console.error("Error creating video project:", error);
      return { success: false, error: error?.message || "Failed to create project" };
    }

    if (masterScript) {
      const slicerResult = await sliceScriptIntoScenes(project.id, masterScript, 1);
      if (!slicerResult.success) {
        console.error("Error slicing scenes:", slicerResult.error);
      }
    }

    return { success: true, projectId: project.id, masterScript: masterScript };
  }
}
