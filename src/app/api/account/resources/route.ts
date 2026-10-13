import { z } from "zod";
import { apiResponse,requireFeature,requireOrigin,readJson,uuidSchema,AccessError } from "@/server/access/requests";
import { accessContext,requireOwnedWorkspace,requireOwnedProject } from "@/server/access/ownership";
import { admitRequest } from "@/server/access/rate-limit";
const schema=z.object({type:z.enum(["workspace","project"]),id:uuidSchema,value:z.string().trim().min(1).max(200)}).strict();
export async function PATCH(request:Request) { return apiResponse(async()=>{
  requireFeature("OWNED_CONTENT_ENABLED"); requireOrigin(request);
  const input=await readJson(request,schema); const {client,user}=await accessContext();
  if(input.type==="workspace") await requireOwnedWorkspace(client,user.id,input.id); else await requireOwnedProject(client,user.id,input.id);
  await admitRequest(client,"rename");
  const {error}=await client.rpc("rename_owned_resource",{resource_type:input.type,resource_id:input.id,value:input.value});
  if(error) throw new AccessError(400,"UPDATE_REJECTED","Unable to update this resource.");
  return Response.json({success:true});
}); }
