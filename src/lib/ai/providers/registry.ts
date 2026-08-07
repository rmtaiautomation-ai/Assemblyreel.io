import type { GenerateInput, ProviderResult, VideoProvider } from "./types";
import { createFalProvider } from "./fal";
import { geminiImageProvider } from "./gemini-image";
import { mockProvider } from "./mock";
import { getStockFallbackVideoUrl } from "./stock-fallback";

// Veo/Runway are exposed in the UI (grouped under "Simulated — no API key
// configured") but have no real integration yet — same behavior as before:
// always resolve to a stock placeholder, clearly labeled by the caller.
function unimplementedVideoProvider(id: string): VideoProvider {
  return {
    id,
    kind: "video",
    async start(input: GenerateInput): Promise<ProviderResult> {
      return { status: "completed", url: getStockFallbackVideoUrl(input.mediaId), simulated: true };
    },
  };
}

const registry: Record<string, VideoProvider> = {
  "fal-luma": createFalProvider("fal-luma"),
  "fal-kling": createFalProvider("fal-kling"),
  "fal-minimax": createFalProvider("fal-minimax"),
  "gemini-image": geminiImageProvider,
  "mock-banana": mockProvider,
  "gemini-veo": unimplementedVideoProvider("gemini-veo"),
  "runway-gen3": unimplementedVideoProvider("runway-gen3"),
};

export function getProvider(model: string): VideoProvider {
  const provider = registry[model];
  if (!provider) {
    throw new Error(`Unknown generation model: ${model}`);
  }
  return provider;
}

// Maps a model id to the `media.source` value the DB schema expects.
export function getSourceForModel(model: string): string {
  if (model.startsWith("fal-")) return "fal";
  if (model === "gemini-image") return "gemini";
  if (model === "mock-banana") return "mock";
  return "stock-fallback"; // gemini-veo, runway-gen3 — unimplemented, always simulated
}
