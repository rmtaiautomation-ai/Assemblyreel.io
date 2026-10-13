import { apiResponse,requireOrigin,readJson } from "@/server/access/requests";
import { requireJobs } from "@/server/access/launch";
import { accessContext,requireOwnedProject,resourceId } from "@/server/access/ownership";
import { jobIntent } from "@/server/generation/job-policy";
import { enqueueJob } from "@/server/generation/jobs";
import { billingErrorResponse } from "@/server/billing/http";
import { BillingError } from "@/server/billing/errors";

export async function GET(request:Request) { return apiResponse(async () => {
  requireJobs(); const {client,user} = await accessContext();
  const projectId = resourceId(new URL(request.url).searchParams.get("projectId"));
  await requireOwnedProject(client,user.id,projectId);
  const {data,error} = await client.from("generation_jobs").select("id,kind,state,error_code,created_at,updated_at,provider_handle").eq("actor_id",user.id).eq("project_id",projectId).order("created_at",{ascending:false}).limit(20);
  if (error) throw error;
  return Response.json({jobs:(data ?? []).map(({provider_handle,...job})=>({...job,cancelable:["queued","claimed"].includes(job.state) && !provider_handle}))});
}); }
export async function POST(request:Request) { return apiResponse(async () => {
  requireJobs();requireOrigin(request);
  const input = await readJson(request,jobIntent);
  try {return Response.json(await enqueueJob(input),{status:202});}
  catch(error) {if(error instanceof BillingError)return billingErrorResponse(error);throw error;}
}); }
