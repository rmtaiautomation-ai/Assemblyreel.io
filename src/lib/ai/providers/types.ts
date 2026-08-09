export type ProviderResult =
  // `simulated` marks a stock placeholder served because no API key/integration
  // exists — the UI labels these "Simulated" rather than "Completed" so a
  // placeholder is never passed off as a real render.
  //
  // `storagePath` is set only when the provider persisted the asset into our own
  // Supabase Storage bucket (gemini-image does; Fal and the stock fallback hand
  // back a URL they host themselves). Without it the row has no handle on the
  // object, so a deleted media row would leak its file in the bucket forever.
  | {
      status: "completed";
      url: string;
      storagePath?: string;
      durationSeconds?: number;
      simulated?: boolean;
    }
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
