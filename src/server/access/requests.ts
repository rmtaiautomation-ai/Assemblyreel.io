import "server-only";
import { z } from "zod";
import { siteOrigin, authLaunchReady } from "@/server/auth/policy";

export class AccessError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const uuidSchema = z.string().uuid();
export function requireFeature(flag: "OWNED_CONTENT_ENABLED" | "PRIVATE_MEDIA_ENABLED") {
  if (!authLaunchReady() || process.env.OWNERSHIP_MIGRATION_READY !== "true" || process.env[flag] !== "true") {
    throw new AccessError(503,"FEATURE_UNAVAILABLE","This feature is awaiting configuration.");
  }
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== siteOrigin()) throw new AccessError(403,"INVALID_ORIGIN","Invalid request origin.");
}
export async function readBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400,"INVALID_BODY","Request body is required.");
  const chunks: Uint8Array[] = []; let size=0;
  while (true) {
    const { done,value }=await reader.read(); if (done) break;
    size+=value.byteLength;
    if(size>limit) { await reader.cancel(); throw new AccessError(413,"BODY_TOO_LARGE","Request is too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readJson<T>(request: Request,schema: z.ZodType<T>,limit=8192): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError(415,"INVALID_CONTENT_TYPE","JSON is required.");
  try { return schema.parse(JSON.parse((await readBytes(request,limit)).toString())); }
  catch(error) { if(error instanceof AccessError) throw error; throw new AccessError(400,"INVALID_INPUT","Please check the submitted details."); }
}
export async function apiResponse(work:()=>Promise<Response>) {
  try {
    const result=await work();
    const response=new Response(result.body,{status:result.status,statusText:result.statusText,headers:result.headers});
    response.headers.set("Cache-Control","private, no-store"); response.headers.set("Pragma","no-cache"); response.headers.set("X-Content-Type-Options","nosniff"); return response;
  } catch(error) {
    const safe=error instanceof AccessError?error:new AccessError(503,"SERVICE_UNAVAILABLE","The service is temporarily unavailable.");
    return Response.json({error:safe.message,code:safe.code},{status:safe.status,headers:{"Cache-Control":"private, no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff"}});
  }
}
