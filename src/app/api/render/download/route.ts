import { apiResponse,requireFeature,AccessError } from "@/server/access/requests";
import { accessContext,requireProjectResource,resourceId } from "@/server/access/ownership";
import { privateAssetUrl } from "@/server/media/private-media";

export async function GET(request:Request) { return apiResponse(async()=>{
  requireFeature("PRIVATE_MEDIA_ENABLED");
  const params=new URL(request.url).searchParams;
  if(params.has("path")) throw new AccessError(400,"INVALID_INPUT","Use an owned artifact ID; filesystem paths are unsupported.");
  const id=resourceId(params.get("artifactId"));
  const {client,user}=await accessContext(); const owned=await requireProjectResource(client,user.id,"render_artifacts",id);
  const {data,error}=await client.from("render_artifacts").select("asset_id,state").eq("id",id).maybeSingle();
  if(error || !data || data.state!=="ready") throw new AccessError(404,"ARTIFACT_UNAVAILABLE","Export is unavailable.");
  return Response.redirect(await privateAssetUrl(data.asset_id,true,owned.project_id),302);
}); }
