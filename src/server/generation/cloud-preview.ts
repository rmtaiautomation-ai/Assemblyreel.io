import "server-only";
import {createHash} from "node:crypto";
import {S3Client,GetObjectCommand} from "@aws-sdk/client-s3";
import {renderMediaOnLambda,getRenderProgress,type AwsRegion} from "@remotion/lambda/client";
import type {SupabaseClient} from "@supabase/supabase-js";
import {renderHandleSchema,type RenderHandle,type GenerationJob} from "./job-policy";

const LIMIT=3145728;
export function cloudPreviewReady() {
  try {config();return process.env.COSTLY_FEATURES_ENABLED === "true" && process.env.CLOUD_PREVIEW_ENABLED === "true"
    && process.env.CLOUD_PREVIEW_BOUNDS_ACCEPTED === "true";}catch{return false;}
}
function config() {
  const value={region:process.env.REMOTION_AWS_REGION ?? "",functionName:process.env.REMOTION_FUNCTION_NAME ?? "",bucketName:process.env.REMOTION_S3_BUCKET_NAME ?? ""};
  const site=new URL(process.env.REMOTION_ACCOUNT_SERVE_URL ?? "");
  if(!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY || !value.functionName
    || !/^[a-z]{2}-[a-z]+-\d$/.test(value.region) || !/^[a-z0-9.-]{3,63}$/.test(value.bucketName)
    || site.protocol !== "https:" || site.username || site.password || site.search || site.hash
    || site.hostname !== `${value.bucketName}.s3.${value.region}.amazonaws.com`
    || !/^\/sites\/account-preview-v1(?:\/index.html)?\/?$/.test(site.pathname))throw new Error("FEATURE_UNAVAILABLE");
  return {...value,serveUrl:site.href};
}
export async function startCloudPreview(job:GenerationJob) {
  if(!cloudPreviewReady() || job.input.version !== "account-preview-v1")throw new Error("FEATURE_UNAVAILABLE");
  const settings=config(),objectKey=`account-preview/${job.id}.mp4`;
  const handle=await renderMediaOnLambda({region:settings.region as AwsRegion,functionName:settings.functionName,serveUrl:settings.serveUrl,
    composition:"AccountPreviewV1",inputProps:{topic:job.input.topic},codec:"h264",privacy:"private",outName:{bucketName:settings.bucketName,key:objectKey},
    framesPerLambda:150,maxRetries:0,timeoutInMilliseconds:60_000,crf:28,forceDurationInFrames:150,forceFps:30,forceWidth:1280,forceHeight:720,
  });
  if(handle.bucketName !== settings.bucketName)throw new Error("SUBMISSION_UNCERTAIN");
  return renderHandleSchema.parse({renderId:handle.renderId,bucketName:handle.bucketName,region:settings.region,functionName:settings.functionName,objectKey});
}
export async function pollCloudPreview(handle:RenderHandle,jobId:string) {
  const settings=config();
  if(handle.bucketName !== settings.bucketName || handle.region !== settings.region || handle.functionName !== settings.functionName
    || handle.objectKey !== `account-preview/${jobId}.mp4`)throw new Error("INVALID_RENDER_HANDLE");
  const progress=await getRenderProgress({renderId:handle.renderId,bucketName:handle.bucketName,functionName:handle.functionName,region:handle.region as AwsRegion});
  if(progress.fatalErrorEncountered)throw new Error("RENDER_RECONCILIATION_REQUIRED");
  return progress.done;
}
export async function persistCloudPreview(admin:SupabaseClient,job:GenerationJob,handle:RenderHandle) {
  // Never fetch the progress URL. IAM fetches only the server-derived S3 object.
  const s3=new S3Client({region:handle.region,maxAttempts:1,credentials:{accessKeyId:process.env.REMOTION_AWS_ACCESS_KEY_ID ?? "",secretAccessKey:process.env.REMOTION_AWS_SECRET_ACCESS_KEY ?? "",sessionToken:process.env.REMOTION_AWS_SESSION_TOKEN}});
  const object=await s3.send(new GetObjectCommand({Bucket:handle.bucketName,Key:handle.objectKey}),{abortSignal:AbortSignal.timeout(30_000)});
  if(!object.Body || !object.ContentLength || object.ContentLength>LIMIT)throw new Error("PRIVATE_OUTPUT_UNAVAILABLE");
  let size=0;const chunks:Uint8Array[]=[];
  for await(const chunk of object.Body as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>LIMIT){s3.destroy();throw new Error("PRIVATE_OUTPUT_UNAVAILABLE");}chunks.push(chunk);}
  s3.destroy();const bytes=Buffer.concat(chunks);
  if(size !== object.ContentLength || bytes.length<12 || bytes.toString("ascii",4,8)!=="ftyp")throw new Error("INVALID_OUTPUT");
  const hash=createHash("sha256").update(bytes).digest("hex"),key=`${job.actor_id}/${job.project_id}/${job.id}`;
  // Await upload and verify existing bytes too: a lost response can retry the
  // same private key, but cannot overwrite or substitute another output.
  await admin.storage.from("renders").upload(key,bytes,{contentType:"video/mp4",upsert:false});
  const stored=await admin.storage.from("renders").download(key);
  if(stored.error || !stored.data || stored.data.size !== size || stored.data.type !== "video/mp4")throw new Error("PRIVATE_OUTPUT_UNAVAILABLE");
  const verified=Buffer.from(await stored.data.arrayBuffer());
  if(createHash("sha256").update(verified).digest("hex") !== hash)throw new Error("PRIVATE_OUTPUT_UNAVAILABLE");
  const finished=await admin.rpc("finish_private_render_job",{p_job_id:job.id,p_token:job.claim_token,p_size:size,p_hash:hash});
  if(finished.error)throw new Error("PRIVATE_OUTPUT_UNAVAILABLE");
}
