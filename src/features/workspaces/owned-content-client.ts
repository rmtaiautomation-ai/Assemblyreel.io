const messages: Record<string, string> = {
  AUTH_REQUIRED: "Log in again to continue.",
  PROFILE_REQUIRED: "Your application account is awaiting setup.",
  RESOURCE_UNAVAILABLE: "This workspace or project is unavailable.",
  WORKSPACE_LIMIT: "The test limit is three workspaces per account.",
  PROJECT_LIMIT: "The test limit is ten projects per workspace.",
  REQUEST_LIMIT: "Please wait before trying again.",
  OPERATION_REUSED: "This save attempt conflicts with an existing save. Refresh the list before starting another.",
  INVALID_INPUT: "Check the submitted details.",
  FEATURE_UNAVAILABLE: "Workspace access is temporarily unavailable.",
};

export class OwnedRequestError extends Error {
  constructor(public status: number, code: string) {
    super(messages[code] ?? "Unable to complete the request. Please retry.");
  }
}

export async function ownedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new OwnedRequestError(response.status, typeof body?.code === "string" ? body.code : "");
  if (body === null) throw new OwnedRequestError(503, "");
  return body as T;
}

export type OwnedSave = { kind: "workspace" | "project"; operationId: string; body: string; workspaceId?: string };

// Capture the entire request once: a failed response must never pair its UUID with edited fields.
export function prepareOwnedSave(kind: OwnedSave["kind"], fields: Record<string, string>, operationId = crypto.randomUUID()): OwnedSave {
  return { kind, operationId, body: JSON.stringify({ [kind]: fields, operationId }), workspaceId: kind === "project" ? fields.workspace_id : undefined };
}

export async function sendOwnedSave(save: OwnedSave) {
  const result = await ownedJson<{ id: string }>(`/api/account/${save.kind === "workspace" ? "workspaces" : "projects"}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: save.body,
  });
  if (result.id !== save.operationId) throw new OwnedRequestError(503, "");
  return result;
}

export function shouldRetryOwnedSave(error: unknown) {
  return !(error instanceof OwnedRequestError) || error.status === 429 || error.status >= 500;
}

export function ownedErrorMessage(error: unknown) {
  return error instanceof OwnedRequestError ? error.message : "Unable to reach the service. Please retry.";
}
