import "server-only";
import { z } from "zod";
import { accessContext } from "./ownership";
import { requireFeature, AccessError, uuidSchema } from "./requests";
import { ASPECT_RATIOS,LANGUAGES,DURATIONS } from "@/lib/workspace-options";
import { admitRequest } from "./rate-limit";

export const workspaceSchema=z.object({
  name:z.string().trim().min(1).max(100),content_theme:z.string().trim().min(1).max(200),
  linked_accounts:z.array(z.string().max(200)).max(1).default([]),
  narration_voice_id:z.string().max(100).nullable().optional(),visual_aesthetic:z.string().max(100).optional(),
  aspect_ratio:z.enum(ASPECT_RATIOS).optional(),video_language:z.enum(LANGUAGES).optional(),
  duration_pref:z.enum(DURATIONS).optional(),
}).strict();

export async function createOwnedWorkspace(input:unknown,operationId:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const payload=workspaceSchema.safeParse(input),operation=uuidSchema.safeParse(operationId);
  if(!payload.success || !operation.success) throw new AccessError(400,"INVALID_INPUT","Check the workspace details.");
  const {client}=await accessContext();
  await admitRequest(client,"workspace");
  const {data,error}=await client.rpc("create_owned_workspace",{payload:payload.data,operation_id:operation.data});
  if(error) throw new AccessError(error.message.includes("TEST_WORKSPACE_LIMIT")?409:400,"WORKSPACE_UNAVAILABLE","Unable to create this workspace. The test limit is three workspaces per account.");
  return {id:data as string};
}
