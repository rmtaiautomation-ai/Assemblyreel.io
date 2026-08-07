import type { GenerateInput, ProviderResult, VideoProvider } from "./types";

// Free, zero-config test mode — intentionally returns no real media (an empty
// url), matching the existing "Simulated" placeholder rendering in
// VideoComposition.tsx (falls back to a gradient background).
export const mockProvider: VideoProvider = {
  id: "mock-banana",
  kind: "image",
  async start(_input: GenerateInput): Promise<ProviderResult> {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { status: "completed", url: "", simulated: true };
  },
};
