import { editorSaveSchema, editorSnapshotSchema, type EditorDocument, type EditorSnapshot } from "./schema";

export class EditorRequestError extends Error {
  constructor(public status: number, public code: string) {
    super(code === "EDITOR_CONFLICT" ? "This project changed in another tab. Keep a copy of your text, then reload the saved version."
      : code === "AUTH_REQUIRED" ? "Your session ended. Keep a copy of your text and log in again."
      : code === "RESOURCE_UNAVAILABLE" ? "This project or linked media is unavailable."
      : code === "OPERATION_REUSED" ? "This save attempt was already used with different details. Keep a copy of your text, then reload the saved version."
      : code === "EDITOR_SCENE_PROTECTED" ? "Existing imported scenes cannot be removed here. Reload the saved version to restore them."
      : code === "FEATURE_UNAVAILABLE" ? "Draft editing is temporarily unavailable. Keep a copy of your text before leaving."
      : code === "REQUEST_LIMIT" ? "Please wait a minute, then retry the original save."
      : code === "INVALID_INPUT" ? "Check the text lengths and timing. Scenes must be 0.1–600 seconds; the timeline limit is two hours and the save limit is 240 KB."
      : code === "EDITOR_LIMIT" ? "This project exceeds the draft editor limits."
      : "Unable to confirm the save. Keep this page open and retry the original save.");
  }
}
export type EditorAttempt = { operationId: string; revision: number; body: string };
export function prepareEditorSave(revision: number, document: EditorDocument, operationId = crypto.randomUUID()): EditorAttempt {
  const parsed = editorSaveSchema.safeParse({ revision, document, operationId });
  if (!parsed.success) throw new EditorRequestError(400, "INVALID_INPUT");
  const body = JSON.stringify(parsed.data);
  // Leave room for JSONB canonical spacing under the database's 256 KiB ceiling.
  if (new TextEncoder().encode(body).byteLength > 240000) throw new EditorRequestError(400, "INVALID_INPUT");
  return { revision, operationId: parsed.data.operationId, body };
}
export async function sendEditorSave(projectId: string, attempt: EditorAttempt) {
  const response = await fetch(`/api/account/projects/${projectId}/editor`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, cache: "no-store", body: attempt.body, signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new EditorRequestError(response.status, result?.code ?? "");
  if (result?.operationId !== attempt.operationId || result?.revision !== attempt.revision + 1) throw new EditorRequestError(503, "");
  return { revision: attempt.revision + 1 };
}
export async function loadEditor(projectId: string): Promise<EditorSnapshot> {
  const response = await fetch(`/api/account/projects/${projectId}/editor`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new EditorRequestError(response.status, data?.code ?? "");
  const parsed = editorSnapshotSchema.safeParse(data);
  if (!parsed.success || parsed.data.project.id !== projectId) throw new EditorRequestError(503, "");
  return parsed.data;
}
export function retryEditorSave(error: unknown) {
  return !(error instanceof EditorRequestError) || error.status === 429 || error.status >= 500;
}
