import "server-only";
import { z } from "zod";
import { accessContext, requireOwnedWorkspace, requireOwnedProject, resourceId } from "./ownership";
import { requireFeature, AccessError, uuidSchema } from "./requests";
import { ART_STYLES,ASPECT_RATIOS,LANGUAGES,DURATIONS } from "@/lib/workspace-options";

export const workspaceSchema=z.object({
  name:z.string().trim().min(1).max(100),content_theme:z.string().trim().min(1).max(200),
  linked_accounts:z.array(z.string().max(200)).max(1).default([]),
  narration_voice_id:z.string().max(100).nullable().optional(),visual_aesthetic:z.enum(ART_STYLES).optional(),
  aspect_ratio:z.enum(ASPECT_RATIOS).optional(),video_language:z.enum(LANGUAGES).optional(),
  duration_pref:z.enum(DURATIONS).optional(),
}).strict();

export const projectSchema=z.object({workspace_id:uuidSchema.transform(value=>value.toLowerCase()),topic:z.string().trim().min(1).max(200)}).strict();
export const renameSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("workspace"),id:uuidSchema,value:z.string().trim().min(1).max(100)}).strict(),
  z.object({type:z.literal("project"),id:uuidSchema,value:z.string().trim().min(1).max(200)}).strict(),
]);

// SQL errors are fixed labels from the reviewed RPCs. Never expose provider details.
export function ownedMutationError(error:{message:string}) {
  switch(error.message) {
    case "AUTH_REQUIRED": return new AccessError(401,"AUTH_REQUIRED","Log in to continue.");
    case "RESOURCE_UNAVAILABLE": return new AccessError(404,"RESOURCE_UNAVAILABLE","Resource is unavailable.");
    case "OPERATION_REUSED": return new AccessError(409,"OPERATION_REUSED","This save attempt was already used. Retry the original details or start a new save.");
    case "TEST_WORKSPACE_LIMIT": return new AccessError(409,"WORKSPACE_LIMIT","The test limit is three workspaces per account.");
    case "TEST_PROJECT_LIMIT": return new AccessError(409,"PROJECT_LIMIT","The test limit is ten projects per workspace.");
    case "REQUEST_RATE_LIMIT": return new AccessError(429,"REQUEST_LIMIT","Please wait before trying again.");
    case "INVALID_WORKSPACE": case "INVALID_PROJECT": case "INVALID_FIELDS": case "INVALID_VALUE": case "INVALID_RESOURCE":
      return new AccessError(400,"INVALID_INPUT","Check the submitted details.");
    default: return new AccessError(503,"SERVICE_UNAVAILABLE","The service is temporarily unavailable.");
  }
}

function savedId(data:unknown,operationId:string) {
  const parsed=uuidSchema.safeParse(data);
  if(!parsed.success || parsed.data.toLowerCase()!==operationId) throw new AccessError(503,"SERVICE_UNAVAILABLE","Unable to confirm this save. Retry with the same details.");
  return {id:operationId};
}

export async function listOwnedWorkspaces() {
  requireFeature("OWNED_CONTENT_ENABLED");
  const {client,user}=await accessContext();
  const {data,error}=await client.from("workspaces").select("id,name,content_theme").eq("user_id",user.id).order("created_at").order("id").limit(50);
  if(error || !data) throw new AccessError(503,"SERVICE_UNAVAILABLE","Workspaces are temporarily unavailable.");
  return data;
}

export async function getOwnedWorkspace(id:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const value=resourceId(id),{client,user}=await accessContext();
  const row=await requireOwnedWorkspace(client,user.id,value);
  return {id:row.id,name:row.name,content_theme:row.content_theme};
}

export async function listOwnedProjects(workspaceId:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const id=resourceId(workspaceId),{client,user}=await accessContext();
  await requireOwnedWorkspace(client,user.id,id);
  const {data,error}=await client.from("video_projects").select("id,workspace_id,topic,status").eq("workspace_id",id).order("created_at").order("id").limit(50);
  if(error || !data) throw new AccessError(503,"SERVICE_UNAVAILABLE","Projects are temporarily unavailable.");
  return data;
}

export async function getOwnedProject(id:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const value=resourceId(id),{client,user}=await accessContext();
  const row=await requireOwnedProject(client,user.id,value);
  return {id:row.id,workspace_id:row.workspace_id,topic:row.topic};
}

export async function createOwnedWorkspace(input:unknown,operationId:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const payload=workspaceSchema.safeParse(input),operation=uuidSchema.safeParse(operationId);
  if(!payload.success || !operation.success) throw new AccessError(400,"INVALID_INPUT","Check the workspace details.");
  const {client}=await accessContext();
  const id=operation.data.toLowerCase();
  const {data,error}=await client.rpc("create_owned_workspace",{payload:payload.data,operation_id:id});
  if(error) throw ownedMutationError(error);
  return savedId(data,id);
}

export async function createOwnedProject(input:unknown,operationId:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const payload=projectSchema.safeParse(input),operation=uuidSchema.safeParse(operationId);
  if(!payload.success || !operation.success) throw new AccessError(400,"INVALID_INPUT","Check the project details.");
  const {client,user}=await accessContext();
  await requireOwnedWorkspace(client,user.id,payload.data.workspace_id);
  const id=operation.data.toLowerCase();
  const {data,error}=await client.rpc("create_owned_project",{payload:payload.data,operation_id:id});
  if(error) throw ownedMutationError(error);
  return savedId(data,id);
}

export async function renameOwnedResource(input:unknown) {
  requireFeature("OWNED_CONTENT_ENABLED");
  const payload=renameSchema.safeParse(input);
  if(!payload.success) throw new AccessError(400,"INVALID_INPUT","Check the new name or topic.");
  const id=payload.data.id.toLowerCase(),{client,user}=await accessContext();
  if(payload.data.type==="workspace") await requireOwnedWorkspace(client,user.id,id);
  else await requireOwnedProject(client,user.id,id);
  const {error}=await client.rpc("rename_owned_resource",{resource_type:payload.data.type,resource_id:id,value:payload.data.value});
  if(error) throw ownedMutationError(error);
  return {success:true as const};
}
