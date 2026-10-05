import { task, logger } from "@trigger.dev/sdk/v3";
import { generateActNarration } from "@/app/actions/audio-actions";
import { directSceneEdits } from "@/lib/ai/agents/edit-director";
import { procureSceneMedia } from "@/app/actions/scout-actions";
import { applyComboToScene } from "@/app/actions/combo-actions";
import { createClient } from "@/lib/supabase/server";

export const runAutopilot = task({
  id: "run-autopilot",
  maxDuration: 3600, // 1 hour
  run: async (payload: { projectId: string; acts: any[] }) => {
    const { projectId, acts } = payload;
    logger.info(`Starting autopilot for project ${projectId}`, { actsCount: acts.length });

    const supabase = await createClient();

    // Loop through each Act
    for (const act of acts) {
      logger.info(`Processing Act ${act.actNumber}...`);

      // 1. Generate Narration
      logger.info(`[Act ${act.actNumber}] Generating narration...`);
      const narrationRes = await generateActNarration(projectId, act.actNumber);

      if (!narrationRes.success) {
        logger.error(`[Act ${act.actNumber}] Narration failed`, { error: narrationRes.error });
        // Depending on product requirements, we might throw to retry, or continue to the next act.
        throw new Error(`Narration failed for act ${act.actNumber}`);
      }

      // 2. Fetch scenes for this act
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, script, sequence_number")
        .eq("project_id", projectId)
        .eq("act_number", act.actNumber)
        .order("sequence_number", { ascending: true });

      if (!scenes || scenes.length === 0) continue;

      // 3. Edit Director AI (Combos & Stock Queries)
      logger.info(`[Act ${act.actNumber}] Running Edit Director on ${scenes.length} scenes...`);
      const directorInputs = scenes.map(s => ({ sceneId: s.id, sceneText: s.script || "" }));
      
      // Fetch project details for formatting
      const { data: project } = await supabase
        .from("video_projects")
        .select("topic, visual_aesthetic, default_generation_mode, workspaces(content_theme)")
        .eq("id", projectId)
        .single();
        
      const topic = project?.topic || "";
      const visualAesthetic = project?.visual_aesthetic || "";
      const wsData = project?.workspaces as any;
      const nicheTheme = (Array.isArray(wsData) ? wsData[0]?.content_theme : wsData?.content_theme) || "";

      const directorResults = await directSceneEdits({
        scenes: directorInputs,
        topic,
        visualAesthetic,
        nicheTheme,
      });

      // 4. Process Director Results (Combos and Media Scout)
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const dirResult = directorResults[i];

        if (!dirResult.decision) {
          logger.warn(`[Scene ${scene.id}] Edit Director returned no decision`, { error: dirResult.error });
          continue;
        }

        const { comboId, stockSearchQueries, overlayText, anchorPhrase } = dirResult.decision;
        logger.info(`[Scene ${scene.id}] applying combo ${comboId}`);

        // A. Apply Combos (create overlay_clips)
        // For autopilot, we don't have exact word timings instantly unless Deepgram finished inside narration.
        // For simplicity, start at 0 duration 3. Real integration would sync `anchorPhrase` via Deepgram word timings.
        await applyComboToScene(projectId, scene.id, comboId, overlayText, 0, 3);

        // B. Media Scout (Stock Search)
        logger.info(`[Scene ${scene.id}] Media Scout running for queries: ${stockSearchQueries.join(', ')}`);
        const scoutRes = await procureSceneMedia({
          projectId,
          sceneId: scene.id,
          queries: stockSearchQueries,
          orientation: "16:9", // Should be fetched from workspace
          type: "video", // or image depending on scene context
        });

        if (!scoutRes.success) {
          logger.warn(`[Scene ${scene.id}] Media Scout failed to find media`, { error: scoutRes.error });
        }
      }

      logger.info(`[Act ${act.actNumber}] Completed processing.`);
    }

    // Mark project as fully approved
    await supabase.from("video_projects").update({ status: "approved" }).eq("id", projectId);

    logger.info(`Autopilot completed for project ${projectId}`);
    return { success: true };
  },
});
