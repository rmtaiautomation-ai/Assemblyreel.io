"use server";
import { requireMutationOrigin } from "@/server/auth/mutations";
import { createOwnedWorkspace,createOwnedProject,renameOwnedResource,listOwnedWorkspaces,listOwnedProjects } from "@/server/access/workspaces";
import { AccessError } from "@/server/access/requests";

function actionError(error:unknown) {
  const safe=error instanceof AccessError?error:error instanceof Error && error.message==="INVALID_ORIGIN"
    ?new AccessError(403,"INVALID_ORIGIN","Invalid request origin.")
    :new AccessError(503,"SERVICE_UNAVAILABLE","The service is temporarily unavailable.");
  return {success:false as const,error:safe.message,code:safe.code,status:safe.status};
}

export async function createWorkspace(input:unknown,operationId:unknown) {
  try { await requireMutationOrigin(); return {success:true as const,workspace:await createOwnedWorkspace(input,operationId)}; }
  catch(error) { return actionError(error); }
}

export async function createProject(input:unknown,operationId:unknown) {
  try { await requireMutationOrigin(); return {success:true as const,project:await createOwnedProject(input,operationId)}; }
  catch(error) { return actionError(error); }
}

export async function renameResource(input:unknown) {
  try { await requireMutationOrigin(); return await renameOwnedResource(input); }
  catch(error) { return actionError(error); }
}

export async function listWorkspaces() {
  try { return {success:true as const,workspaces:await listOwnedWorkspaces()}; }
  catch(error) { return actionError(error); }
}

export async function listProjects(workspaceId:unknown) {
  try { return {success:true as const,projects:await listOwnedProjects(workspaceId)}; }
  catch(error) { return actionError(error); }
}
