import { z } from "zod";
import { apiResponse,requireFeature,requireOrigin,readJson,uuidSchema } from "@/server/access/requests";
import { createOwnedWorkspace,workspaceSchema,listOwnedWorkspaces } from "@/server/access/workspaces";

export async function GET() { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED");
  return Response.json({workspaces:await listOwnedWorkspaces()});
}); }
export async function POST(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); requireOrigin(request);
  const input=await readJson(request,z.object({workspace:workspaceSchema,operationId:uuidSchema}).strict());
  return Response.json(await createOwnedWorkspace(input.workspace,input.operationId),{status:201});
}); }
