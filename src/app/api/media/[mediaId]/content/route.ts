import { apiResponse,requireFeature,AccessError } from "@/server/access/requests";
import { accessContext,requireProjectResource } from "@/server/access/ownership";
import { privateAssetUrl } from "@/server/media/private-media";

export async function GET(_request:Request,{params}:{params:Promise<{mediaId:string}>}) { return apiResponse(async()=>{
  requireFeature("PRIVATE_MEDIA_ENABLED"); const {mediaId}=await params;
  const {client,user}=await accessContext(); const media=await requireProjectResource(client,user.id,"media",mediaId);
  const {data,error}=await client.from("private_assets").select("id").eq("media_id",mediaId).eq("project_id",media.project_id).maybeSingle();
  if(error || !data) throw new AccessError(404,"ASSET_UNAVAILABLE","Private asset is unavailable.");
  return Response.redirect(await privateAssetUrl(data.id,false,media.project_id),302);
}); }
