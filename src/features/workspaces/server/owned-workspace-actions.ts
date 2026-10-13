"use server";
import { requireMutationOrigin } from "@/server/auth/mutations";
import { createOwnedWorkspace } from "@/server/access/workspaces";

export async function createWorkspace(input:unknown,operationId:unknown) {
  try { await requireMutationOrigin(); return {success:true,workspace:await createOwnedWorkspace(input,operationId)}; }
  catch { return {success:false,error:"Unable to create a workspace. Check configuration, your details, and the three-workspace test limit."}; }
}
