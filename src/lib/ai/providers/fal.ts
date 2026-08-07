import type { GenerateInput, ProviderResult, VideoProvider } from "./types";
import { getStockFallbackVideoUrl } from "./stock-fallback";

const ENDPOINT_MAP: Record<string, string> = {
  "fal-luma": "fal-ai/luma-dream-machine",
  "fal-kling": "fal-ai/kling-video/v1/standard/text-to-video",
  "fal-minimax": "fal-ai/minimax/video-01",
};

// Fal's queue API returns {request_id, status_url, response_url} on submit —
// never a finished video URL. The previous implementation checked
// `result.video?.url` on this exact response and always got undefined, so
// every "real" generation silently fell through to the stock fallback.
interface FalSubmitResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ERROR";
}

export function createFalProvider(id: keyof typeof ENDPOINT_MAP): VideoProvider {
  return {
    id,
    kind: "video",
    async start(input: GenerateInput): Promise<ProviderResult> {
      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        return { status: "completed", url: getStockFallbackVideoUrl(input.mediaId), simulated: true };
      }

      const modelEndpoint = ENDPOINT_MAP[id];
      try {
        const response = await fetch(`https://queue.fal.run/${modelEndpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: input.prompt,
            aspect_ratio: input.aspectRatio,
          }),
        });

        if (!response.ok) {
          console.warn(`[Fal.ai Error] Status ${response.status}: falling back to simulation.`);
          return { status: "completed", url: getStockFallbackVideoUrl(input.mediaId), simulated: true };
        }

        const submit: FalSubmitResponse = await response.json();
        if (!submit.status_url || !submit.response_url) {
          console.warn("[Fal.ai Error] Unexpected submit response shape:", submit);
          return { status: "completed", url: getStockFallbackVideoUrl(input.mediaId), simulated: true };
        }

        return {
          status: "pending",
          providerMetadata: {
            requestId: submit.request_id,
            statusUrl: submit.status_url,
            responseUrl: submit.response_url,
          },
        };
      } catch (err) {
        console.warn("[Fal.ai Request Error]:", err);
        return { status: "completed", url: getStockFallbackVideoUrl(input.mediaId), simulated: true };
      }
    },
    async checkStatus(providerMetadata: Record<string, any>): Promise<ProviderResult> {
      const falKey = process.env.FAL_KEY;
      const { statusUrl, responseUrl } = providerMetadata;
      try {
        const statusRes = await fetch(statusUrl, {
          headers: { Authorization: `Key ${falKey}` },
        });
        if (!statusRes.ok) {
          return { status: "failed", error: `Fal status check failed (${statusRes.status})` };
        }
        const statusData: FalStatusResponse = await statusRes.json();

        if (statusData.status === "FAILED" || statusData.status === "ERROR") {
          // A real Fal failure after acceptance is surfaced honestly — it must
          // NOT silently masquerade as a stock-fallback success.
          return { status: "failed", error: "Fal.ai generation failed" };
        }
        if (statusData.status !== "COMPLETED") {
          return { status: "pending", providerMetadata };
        }

        const resultRes = await fetch(responseUrl, {
          headers: { Authorization: `Key ${falKey}` },
        });
        if (!resultRes.ok) {
          return { status: "failed", error: `Fal result fetch failed (${resultRes.status})` };
        }
        const result = await resultRes.json();
        const url = result?.video?.url;
        if (!url) {
          return { status: "failed", error: "Fal completed but returned no video URL" };
        }
        return { status: "completed", url };
      } catch (err: any) {
        return { status: "failed", error: err.message || "Fal status check error" };
      }
    },
  };
}
