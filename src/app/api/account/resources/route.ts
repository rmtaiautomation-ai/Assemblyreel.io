import { apiResponse,requireFeature,requireOrigin,readJson } from "@/server/access/requests";
import { renameOwnedResource,renameSchema } from "@/server/access/workspaces";
export async function PATCH(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); requireOrigin(request);
  const input=await readJson(request,renameSchema);
  return Response.json(await renameOwnedResource(input));
}); }
