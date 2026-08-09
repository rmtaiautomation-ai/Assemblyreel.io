"use server";

import { createClient } from "@/lib/supabase/server";
import { generateScript, generateActOutlines } from "@/lib/ai/script-writer";
import { sliceScriptIntoScenes } from "@/app/actions/slicer-actions";
import { enrichAndPersistScenes } from "@/app/actions/orchestrator-actions";
import { resolveDurationProfile } from "@/lib/ai/generation-rules";
import type { TrackStates, ProjectStatus } from "@/lib/timeline-types";

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

  // Cookie-scoped anon client — RLS applies. Named plainly because calling it
  // "supabaseAdmin" implied service-role privileges it has never had, which made
  // silent RLS denials look impossible when reading this code.
  const supabase = await createClient();
  // Derived from the shared rules module rather than a local substring check, so the
  // long-form branch can never disagree with the pacing the agents are given.
  const { isLongForm } = resolveDurationProfile(targetDuration);

  // Non-fatal problems from agents 3-7. Collected rather than thrown: a video whose
  // characters drifted is still worth delivering, but the user must be told.
  const pipelineWarnings: string[] = [];

  if (isLongForm) {
    // 1. Generate 5-Act Structure (or 7, 9, 11 based on duration and niche)
    const actOutlinesRes = await generateActOutlines(topic, narrativeArc, workspaceTheme, targetDuration);
    if (!actOutlinesRes.success || !actOutlinesRes.acts) {
      return { success: false, error: "Failed to generate Act Outlines for Long-Form video." };
    }
    
    // Save to Database initially with pending status and empty master script
    const { data: project, error } = await supabase.from('video_projects').insert([
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
        nicheTheme: workspaceTheme,
        targetDuration,
        actOutline: act
      });

      if (aiResult.success && aiResult.scriptLines) {
        const actScriptText = aiResult.scriptLines.join("\n\n");
        combinedScript += `\n\n=== ACT ${act.actNumber}: ${act.title} ===\n\n` + actScriptText;
        
        // Slice just this Act
        const slicerResult = await sliceScriptIntoScenes({
          projectId: project.id,
          fullScript: actScriptText,
          startingSequenceNumber,
          nicheTheme: workspaceTheme,
          targetDuration,
        });
        if (slicerResult.success && slicerResult.scenes && slicerResult.sceneIds) {
          startingSequenceNumber += slicerResult.scenes.length;

          // Agents 3-7 run per Act, so a long-form video enriches incrementally
          // instead of holding every scene in memory until the last Act lands.
          const enrichment = await enrichAndPersistScenes({
            projectId: project.id,
            sceneIds: slicerResult.sceneIds,
            slicedScenes: slicerResult.scenes,
            topic,
            visualAesthetic: visualAesthetic || "Cinematic",
            nicheTheme: workspaceTheme,
          });
          pipelineWarnings.push(...enrichment.warnings);
          if (!enrichment.success && enrichment.error) {
            pipelineWarnings.push(`Act ${act.actNumber}: ${enrichment.error}`);
          }
        }
      }
    }

    // Update Project with final master script
    await supabase.from('video_projects')
      .update({ status: 'drafting', master_script: combinedScript.trim() })
      .eq('id', project.id);

    return {
      success: true,
      projectId: project.id,
      masterScript: combinedScript.trim(),
      warnings: pipelineWarnings,
    };

  } else {
    // STANDARD / SHORT-FORM EXECUTION
    const aiResult = await generateScript({
      topic,
      narrativeArc,
      hook: scriptHook,
      visualAesthetic: visualAesthetic || "Cinematic",
      pov: "Third-person omnipresent",
      nicheTheme: workspaceTheme,
      targetDuration
    });

    const masterScript = aiResult.success && aiResult.scriptLines 
      ? aiResult.scriptLines.join("\n\n") 
      : null;

    const status = masterScript ? 'drafting' : 'pending';

    const { data: project, error } = await supabase.from('video_projects').insert([
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
      const slicerResult = await sliceScriptIntoScenes({
        projectId: project.id,
        fullScript: masterScript,
        startingSequenceNumber: 1,
        nicheTheme: workspaceTheme,
        targetDuration,
      });
      if (!slicerResult.success) {
        console.error("Error slicing scenes:", slicerResult.error);
      } else if (slicerResult.scenes && slicerResult.sceneIds) {
        const enrichment = await enrichAndPersistScenes({
          projectId: project.id,
          sceneIds: slicerResult.sceneIds,
          slicedScenes: slicerResult.scenes,
          topic,
          visualAesthetic: visualAesthetic || "Cinematic",
          nicheTheme: workspaceTheme,
        });
        pipelineWarnings.push(...enrichment.warnings);
        if (!enrichment.success && enrichment.error) {
          pipelineWarnings.push(enrichment.error);
        }
      }
    }

    return {
      success: true,
      projectId: project.id,
      masterScript: masterScript,
      warnings: pipelineWarnings,
    };
  }
}

export async function updateProjectTrackStates(projectId: string, trackStates: TrackStates) {
  // Cookie-scoped anon client — RLS applies, so an RLS denial surfaces here as an
  // ordinary `error`. That is precisely why callers must check the returned
  // `success` instead of fire-and-forgetting: a blocked write is indistinguishable
  // from a successful one otherwise, which is how narration_url silently vanished.
  const supabase = await createClient();
  const { error } = await supabase.from('video_projects')
    .update({ track_states: trackStates })
    .eq('id', projectId);

  if (error) {
    console.error("Error updating track states:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from('video_projects')
    .update({ status })
    .eq('id', projectId);

  if (error) {
    console.error("Error updating project status:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Persists the global auto-captions toggle.
 *
 * Requires db/add-caption-columns.sql. Callers must check `success`: this setting
 * changes what the exported video looks like, so a silently-dropped write would let
 * the editor show captions on while the next render produced a video without them.
 */
export async function updateProjectCaptionsEnabled(projectId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('video_projects')
    .update({ captions_enabled: enabled })
    .eq('id', projectId);

  if (error) {
    console.error("Error updating captions_enabled:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

