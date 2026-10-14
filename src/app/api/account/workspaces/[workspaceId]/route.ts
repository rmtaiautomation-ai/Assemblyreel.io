import { apiResponse,requireFeature } from "@/server/access/requests";
import { getOwnedWorkspace } from "@/server/access/workspaces";

export async function GET(_request:Request,context:{params:Promise<{workspaceId:string}>}) {
  return apiResponse(async()=>{
    requireFeature("OWNED_CONTENT_ENABLED");
    return Response.json({workspace:await getOwnedWorkspace((await context.params).workspaceId)});
  });
}
