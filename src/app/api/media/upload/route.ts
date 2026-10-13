import { apiResponse,requireFeature,requireOrigin,readBytes,AccessError } from "@/server/access/requests";
import { accessContext,requireOwnedProject,resourceId } from "@/server/access/ownership";
import { uploadPrivateMedia } from "@/server/media/private-media";
import { admitRequest } from "@/server/access/rate-limit";

export async function POST(request:Request) { return apiResponse(async()=>{
  requireFeature("PRIVATE_MEDIA_ENABLED"); requireOrigin(request);
  const projectId=resourceId(request.headers.get("x-project-id")),id=resourceId(request.headers.get("idempotency-key"));
  const {client,user}=await accessContext(); await requireOwnedProject(client,user.id,projectId);
  await admitRequest(client,"upload");
  // A bounded binary endpoint avoids unbounded multipart parsing on Vercel.
  const mime=request.headers.get("content-type")?.split(";")[0] ?? "";
  const name=decodeURIComponent(request.headers.get("x-file-name") ?? "upload");
  if(name.length>100 || /[\r\n]/.test(name)) throw new AccessError(400,"INVALID_INPUT","Invalid filename.");
  const bytes=await readBytes(request,3*1024*1024);
  return Response.json({success:true,...await uploadPrivateMedia(projectId,id,bytes,mime,name)},{status:201});
}); }
