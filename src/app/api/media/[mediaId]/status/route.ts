import { apiResponse,requireFeature,AccessError } from "@/server/access/requests";
import { accessContext,requireProjectResource } from "@/server/access/ownership";
export async function GET(_request:Request,{params}:{params:Promise<{mediaId:string}>}) { return apiResponse(async()=>{
  requireFeature("PRIVATE_MEDIA_ENABLED"); const {mediaId}=await params;
  const {client,user}=await accessContext(); const media=await requireProjectResource(client,user.id,"media",mediaId);
  const {data,error}=await client.from("private_assets").select("state,mime_type").eq("media_id",media.id).eq("project_id",media.project_id).maybeSingle();
  if(error || !data) throw new AccessError(404,"ASSET_UNAVAILABLE","Private asset is unavailable.");
  return Response.json({success:true,status:data.state,url:data.state==="ready"?`/api/media/${media.id}/content`:null});
}); }
