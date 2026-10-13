import { z } from "zod";
import { apiResponse,requireFeature,requireOrigin,readJson,uuidSchema } from "@/server/access/requests";
import { accessContext,requireOwnedProject } from "@/server/access/ownership";
import { importMediaBytes } from "@/server/media/import-media";
import { uploadPrivateMedia } from "@/server/media/private-media";
import { admitRequest } from "@/server/access/rate-limit";
export async function POST(request:Request) { return apiResponse(async()=>{
  requireFeature("PRIVATE_MEDIA_ENABLED"); requireOrigin(request);
  const input=await readJson(request,z.object({url:z.string().max(2048),projectId:uuidSchema,operationId:uuidSchema}).strict());
  const {client,user}=await accessContext(); await requireOwnedProject(client,user.id,input.projectId);
  await admitRequest(client,"import");
  const {bytes,mime}=await importMediaBytes(input.url);
  return Response.json({success:true,...await uploadPrivateMedia(input.projectId,input.operationId,bytes,mime,"imported-media")},{status:201});
}); }
