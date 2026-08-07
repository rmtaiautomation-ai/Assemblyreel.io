export type ProviderResult =
  // `simulated` marks a stock placeholder served because no API key/integration
  // exists — the UI labels these "Simulated" rather than "Completed" so a
  // placeholder is never passed off as a real render.
  | { status: "completed"; url: string; durationSeconds?: number; simulated?: boolean }
  | { status: "pending"; providerMetadata: Record<string, any> }
  | { status: "failed"; error: string };

export interface GenerateInput {
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: string;
  projectId: string;
  mediaId: string;
}

export interface VideoProvider {
  id: string;
  kind: "video" | "image";
  start(input: GenerateInput): Promise<ProviderResult>;
  checkStatus?(providerMetadata: Record<string, any>): Promise<ProviderResult>;
}
