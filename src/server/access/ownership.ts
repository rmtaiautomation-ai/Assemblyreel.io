import "server-only";
import { createClient } from "@/lib/supabase/server";
import { authLaunchReady, confirmedIdentity } from "@/server/auth/policy";
import { AccessError, uuidSchema } from "./requests";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function accessContext() {
  if (!authLaunchReady()) throw new AccessError(503,"FEATURE_UNAVAILABLE","Account access is awaiting configuration.");
  const client=await createClient();
  const {data,error}=await client.auth.getUser();
  if(error || !confirmedIdentity(data.user)) throw new AccessError(401,"AUTH_REQUIRED","Log in to continue.");
  const profile=await client.from("users").select("id").eq("id",data.user!.id).maybeSingle();
  if(profile.error || !profile.data) throw new AccessError(403,"PROFILE_REQUIRED","Your application account is awaiting setup.");
  return {client,user:data.user!};
}
export function resourceId(value: unknown) {
  const result=uuidSchema.safeParse(value);
  if(!result.success) throw new AccessError(400,"INVALID_ID","Invalid resource identifier.");
  return result.data.toLowerCase();
}
export async function requireOwnedWorkspace(client:SupabaseClient,userId:string,id:unknown) {
  const value=resourceId(id);
  const {data,error}=await client.from("workspaces").select("id,user_id,name,content_theme").eq("id",value).eq("user_id",userId).maybeSingle();
  if(error || !data) throw new AccessError(404,"RESOURCE_UNAVAILABLE","Resource is unavailable.");
  return data;
}
export async function requireOwnedProject(client:SupabaseClient,userId:string,id:unknown) {
  const value=resourceId(id);
  const {data,error}=await client.from("video_projects").select("id,workspace_id,topic").eq("id",value).maybeSingle();
  if(error || !data) throw new AccessError(404,"RESOURCE_UNAVAILABLE","Resource is unavailable.");
  await requireOwnedWorkspace(client,userId,data.workspace_id);
  return data;
}
export async function requireProjectResource(client:SupabaseClient,userId:string,table:"scenes"|"media"|"render_artifacts",id:unknown,projectId?:string) {
  const value=resourceId(id);
  const {data,error}=await client.from(table).select("id,project_id").eq("id",value).maybeSingle();
  if(error || !data || (projectId && data.project_id!==resourceId(projectId))) throw new AccessError(404,"RESOURCE_UNAVAILABLE","Resource is unavailable.");
  await requireOwnedProject(client,userId,data.project_id);
  return data;
}
