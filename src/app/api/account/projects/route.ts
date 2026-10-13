import { apiResponse,requireFeature } from "@/server/access/requests";
import { accessContext,requireOwnedWorkspace,resourceId } from "@/server/access/ownership";
export async function GET(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); const id=resourceId(new URL(request.url).searchParams.get("workspaceId"));
  const {client,user}=await accessContext(); await requireOwnedWorkspace(client,user.id,id);
  const {data,error}=await client.from("video_projects").select("id,topic").eq("workspace_id",id).limit(50);
  if(error) throw error; return Response.json({projects:data});
}); }
