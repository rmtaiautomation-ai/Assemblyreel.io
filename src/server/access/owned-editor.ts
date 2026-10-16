import "server-only";
import { accessContext, resourceId } from "./ownership";
import { AccessError } from "./requests";
import { ownedMutationError } from "./workspaces";
import { ownedEditorReady } from "@/server/auth/policy";
import { editorSaveSchema, editorSnapshotSchema } from "@/features/owned-editor/schema";

export function requireOwnedEditor() {
  if (!ownedEditorReady()) throw new AccessError(503, "FEATURE_UNAVAILABLE", "Draft editing is awaiting configuration.");
}
function editorError(error: { message: string }) {
  switch (error.message) {
    case "INVALID_EDITOR": return new AccessError(400, "INVALID_INPUT", "Check the scene text and timing.");
    case "EDITOR_CONFLICT": return new AccessError(409, "EDITOR_CONFLICT", "This project changed in another tab. Reload the saved version before editing again.");
    case "EDITOR_SCENE_PROTECTED": return new AccessError(409, "EDITOR_SCENE_PROTECTED", "Existing imported scenes cannot be removed here.");
    case "EDITOR_LIMIT": return new AccessError(409, "EDITOR_LIMIT", "This project exceeds the draft editor limits.");
    default: return ownedMutationError(error);
  }
}
export async function readOwnedEditor(projectId: unknown) {
  requireOwnedEditor();
  const id = resourceId(projectId), { client } = await accessContext();
  const { data, error } = await client.rpc("read_owned_editor", { p_project_id: id });
  if (error) throw editorError(error);
  const result = editorSnapshotSchema.safeParse(data);
  if (!result.success || result.data.project.id !== id) throw new AccessError(503, "SERVICE_UNAVAILABLE", "Unable to load this draft safely. Retry later.");
  return result.data;
}
export async function saveOwnedEditor(projectId: unknown, input: unknown) {
  requireOwnedEditor();
  const id = resourceId(projectId), parsed = editorSaveSchema.safeParse(input);
  if (!parsed.success) throw new AccessError(400, "INVALID_INPUT", "Check the scene text and timing.");
  const { client } = await accessContext();
  const { operationId, revision, document } = parsed.data;
  const { data, error } = await client.rpc("save_owned_editor", {
    p_project_id: id, p_revision: revision, p_operation_id: operationId, p_document: document,
  });
  if (error) throw editorError(error);
  if (!data || data.operationId !== operationId || data.revision !== revision + 1) {
    throw new AccessError(503, "SERVICE_UNAVAILABLE", "Unable to confirm this save. Retry the original save.");
  }
  return { operationId, revision: revision + 1 };
}
