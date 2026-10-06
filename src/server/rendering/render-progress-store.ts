export interface RenderProgressEntry {
  progress: number;
  stage: string;
  mode: "local" | "lambda";
  renderId?: string;
  bucketName?: string;
  outputUrl?: string | null;
  error?: string | null;
  startedAt: number;
}

/**
 * In-memory progress is intentional for the app's single-machine execution model.
 * It also acts as the per-project in-flight lock for both rendering backends.
 */
const renderProgress = new Map<string, RenderProgressEntry>();

const STALE_RENDER_MS = 40 * 60 * 1000;

export function getRenderProgress(projectId: string): RenderProgressEntry | undefined {
  return renderProgress.get(projectId);
}

export function setRenderProgress(projectId: string, entry: RenderProgressEntry): void {
  renderProgress.set(projectId, entry);
}

export function isRenderInFlight(projectId: string): boolean {
  const entry = getRenderProgress(projectId);
  if (!entry) return false;
  if (entry.stage === "done" || entry.stage === "error") return false;
  return Date.now() - entry.startedAt <= STALE_RENDER_MS;
}
