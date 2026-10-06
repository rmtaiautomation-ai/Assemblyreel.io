import { searchStockMedia, StockMediaResult } from "@/lib/media/stock-search";
import { createClient } from "@/lib/supabase/server";

export interface MediaScoutParams {
  projectId: string;
  sceneId: string;
  queries: string[];
  orientation: "16:9" | "9:16";
  type: "video" | "image";
}

export async function procureSceneMedia({ projectId, sceneId, queries, orientation, type }: MediaScoutParams) {
  const supabase = await createClient();
  const providers = ["pexels", "pixabay", "wikimedia"];

  // 1. Get already used media to avoid duplicates
  const { data: usedMedia } = await supabase
    .from("scenes")
    .select("media_url")
    .eq("project_id", projectId)
    .not("media_url", "is", null);
    
  const usedUrls = new Set(usedMedia?.map(row => row.media_url) || []);

  let bestResult: StockMediaResult | null = null;

  // 2. 3-tier search: Most specific query first
  for (const query of queries) {
    if (!query) continue;
    
    // Check all providers for this query
    for (const provider of providers) {
      try {
        const results = await searchStockMedia(query, provider, type);
        
        // Find the first result that hasn't been used yet
        // Orientation match could be checked here if provider returns dimensions, 
        // but for now we take the top novel result
        const novelResult = results.find(r => !usedUrls.has(r.mediaUrl));
        
        if (novelResult) {
          bestResult = novelResult;
          break; // Break provider loop
        }
      } catch (error) {
        console.warn(`[Media Scout] Provider ${provider} failed for query "${query}":`, error);
        continue;
      }
    }
    
    if (bestResult) {
      break; // Break query loop, we found our media
    }
  }

  if (bestResult) {
    // We found stock! Usually the user needs to approve it (unless Autopilot overrides), 
    // but we can save the proposed URL to the scene.
    
    // According to Plan 26, the Scout selects the top result.
    // If it's step-by-step, it's just saved for approval. 
    // If it's autopilot, it's used.
    
    const { error: updateError } = await supabase
      .from("scenes")
      .update({
        media_url: bestResult.mediaUrl,
        media_source: bestResult.type === "video" ? "stock_video" : "stock_image",
      })
      .eq("id", sceneId);

    if (updateError) {
      return { success: false, error: "Found media, but failed to save to scene: " + updateError.message };
    }
    
    return { success: true, result: bestResult };
  } else {
    // Generative fallback eliminated per user request. We just leave it blank or fail.
    return { success: false, error: "No matching stock media found across all queries and providers." };
  }
}
