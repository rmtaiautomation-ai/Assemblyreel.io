import "server-only";
import { createHash } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { accessContext,requireOwnedProject,resourceId } from "@/server/access/ownership";
import { AccessError,requireFeature } from "@/server/access/requests";
import { admitRequest } from "@/server/access/rate-limit";

export const MAX_UPLOAD_BYTES=3*1024*1024;
export function validateMediaBytes(bytes:Buffer,mime:string) {
  if(bytes.length<12 || bytes.length>MAX_UPLOAD_BYTES) throw new AccessError(400,"INVALID_FILE","File must be between 12 bytes and 3 MiB.");
  const valid = mime==="image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    mime==="image/jpeg" ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
    mime==="image/webp" ? bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP" :
    mime==="audio/wav" ? bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WAVE" :
    mime==="audio/mpeg" ? bytes.toString("ascii",0,3)==="ID3" || (bytes[0]===255 && (bytes[1]&224)===224) :
    mime==="video/mp4" ? bytes.toString("ascii",4,8)==="ftyp" : false;
  if(!valid) throw new AccessError(400,"INVALID_FILE","File content does not match a supported media type.");
}

function storageClient() {
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new AccessError(503,"STORAGE_UNAVAILABLE","Private storage is unavailable.");
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}

export function validateAssetKey(asset:{actor_id:string;project_id:string;id:string;object_key:string;bucket:string}) {
  const expected=`${resourceId(asset.actor_id)}/${resourceId(asset.project_id)}/${resourceId(asset.id)}`;
  if(asset.object_key!==expected || !["project-media","renders"].includes(asset.bucket)) throw new AccessError(404,"ASSET_UNAVAILABLE","Private asset is unavailable.");
}

export async function uploadPrivateMedia(project:unknown,id:unknown,bytes:Buffer,mime:string,name:string) {
  requireFeature("PRIVATE_MEDIA_ENABLED");
  const projectId=resourceId(project),operationId=resourceId(id);
  validateMediaBytes(bytes,mime);
  const {client,user}=await accessContext(); await requireOwnedProject(client,user.id,projectId);
  const admin=storageClient();
  const hash=createHash("sha256").update(bytes).digest("hex");
  const reserved=await client.rpc("reserve_private_media",{p_id:operationId,p_project:projectId,p_mime:mime,p_size:bytes.length,p_hash:hash,p_name:name.slice(0,100)});
  if(reserved.error) throw new AccessError(409,"UPLOAD_REJECTED","Upload reservation was rejected or the test storage limit was reached.");
  const {data:asset,error}=await client.from("private_assets").select("*").eq("id",operationId).eq("project_id",projectId).maybeSingle();
  if(error || !asset) throw new AccessError(503,"STORAGE_UNAVAILABLE","Private asset reservation is unavailable.");
  validateAssetKey(asset);
  if(asset.state==="ready") return {mediaId:operationId,url:`/api/media/${operationId}/content`};
  // Retry a persisted-but-unfinalized upload without overwriting another object.
  const {error:uploadError}=await admin.storage.from(asset.bucket).upload(asset.object_key,bytes,{contentType:mime,upsert:false});
  const existing=await admin.storage.from(asset.bucket).download(asset.object_key);
  if(existing.error || !existing.data || existing.data.size!==bytes.length || existing.data.type!==mime ||
      createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex")!==hash) {
      await admin.rpc("finish_private_media",{p_id:operationId,p_actor:user.id,p_hash:hash,p_ready:false});
      throw new AccessError(503,"UPLOAD_FAILED","Upload was not persisted. Retry with the same operation ID.");
  }
  // Duplicate-upload responses are safe only when the stored bytes match above.
  void uploadError;
  const finished=await admin.rpc("finish_private_media",{p_id:operationId,p_actor:user.id,p_hash:hash,p_ready:true});
  if(finished.error) throw new AccessError(503,"FINALIZATION_PENDING","Upload persisted but confirmation failed. Retry with the same operation ID.");
  return {mediaId:operationId,url:`/api/media/${operationId}/content`};
}

export async function privateAssetUrl(assetId:unknown,download=false,expectedProject?:string) {
  requireFeature("PRIVATE_MEDIA_ENABLED"); const id=resourceId(assetId);
  const {client,user}=await accessContext();
  const {data:asset,error}=await client.from("private_assets").select("*").eq("id",id).maybeSingle();
  if(error || !asset || asset.state!=="ready" || (expectedProject && asset.project_id!==expectedProject)) throw new AccessError(404,"ASSET_UNAVAILABLE","Private asset is unavailable.");
  await requireOwnedProject(client,user.id,asset.project_id); validateAssetKey(asset);
  if(download && (asset.bucket!=="renders" || asset.mime_type!=="video/mp4")) throw new AccessError(404,"ARTIFACT_UNAVAILABLE","Export is unavailable.");
  await admitRequest(client,"sign");
  const {data,error:signError}=await storageClient().storage.from(asset.bucket).createSignedUrl(asset.object_key,60,download?{download:`${id}.mp4`}:undefined);
  if(signError || !data?.signedUrl) throw new AccessError(503,"STORAGE_UNAVAILABLE","Private storage is unavailable.");
  return data.signedUrl;
}
