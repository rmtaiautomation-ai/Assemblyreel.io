import { z } from "zod";
import { apiResponse,requireFeature,requireOrigin,readJson,uuidSchema } from "@/server/access/requests";
import { accessContext } from "@/server/access/ownership";
import { createOwnedWorkspace,workspaceSchema } from "@/server/access/workspaces";

export async function GET() { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); const {client,user}=await accessContext();
  const {data,error}=await client.from("workspaces").select("id,name,content_theme").eq("user_id",user.id).order("created_at").limit(3);
  if(error) throw error; return Response.json({workspaces:data});
}); }
export async function POST(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); requireOrigin(request);
  const input=await readJson(request,z.object({workspace:workspaceSchema,operationId:uuidSchema}).strict());
  return Response.json(await createOwnedWorkspace(input.workspace,input.operationId),{status:201});
}); }
