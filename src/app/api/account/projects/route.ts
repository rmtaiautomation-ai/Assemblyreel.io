import { z } from "zod";
import { apiResponse,requireFeature,requireOrigin,readJson,uuidSchema,AccessError } from "@/server/access/requests";
import { listOwnedProjects,createOwnedProject,projectSchema } from "@/server/access/workspaces";
export async function GET(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED");
  const query=new URL(request.url).searchParams;
  if(query.getAll("workspaceId").length!==1 || [...query.keys()].some(key=>key!=="workspaceId")) throw new AccessError(400,"INVALID_INPUT","Choose one workspace.");
  return Response.json({projects:await listOwnedProjects(query.get("workspaceId"))});
}); }
export async function POST(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); requireOrigin(request);
  const input=await readJson(request,z.object({project:projectSchema,operationId:uuidSchema}).strict());
  return Response.json(await createOwnedProject(input.project,input.operationId),{status:201});
}); }
