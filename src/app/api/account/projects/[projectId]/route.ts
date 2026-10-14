import { apiResponse,requireFeature } from "@/server/access/requests";
import { getOwnedProject } from "@/server/access/workspaces";

export async function GET(_request:Request,context:{params:Promise<{projectId:string}>}) {
  return apiResponse(async()=>{
    requireFeature("OWNED_CONTENT_ENABLED");
    return Response.json({project:await getOwnedProject((await context.params).projectId)});
  });
}
