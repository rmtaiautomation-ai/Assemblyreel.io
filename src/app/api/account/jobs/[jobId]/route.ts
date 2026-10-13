import { apiResponse,requireOrigin,AccessError } from "@/server/access/requests";
import { requireJobs } from "@/server/access/launch";
import { accessContext,resourceId,requireOwnedProject } from "@/server/access/ownership";
import { createBillingAdminClient } from "@/server/billing/runtime";

type Context = {params:Promise<{jobId:string}>};
async function ownedJob(context:Context) {
  const {client,user} = await accessContext();
  const {data,error} = await client.from("generation_jobs").select("id,project_id,state,output,error_code").eq("id",resourceId((await context.params).jobId)).eq("actor_id",user.id).maybeSingle();
  if (error || !data) throw new AccessError(404,"RESOURCE_UNAVAILABLE","Job is unavailable.");
  await requireOwnedProject(client,user.id,data.project_id);
  return {job:data,user};
}
export async function GET(_request:Request,context:Context) { return apiResponse(async () => {
  requireJobs(); const {job} = await ownedJob(context);
  return Response.json({job});
}); }
export async function DELETE(request:Request,context:Context) { return apiResponse(async () => {
  requireJobs();requireOrigin(request);const {job,user} = await ownedJob(context);
  const {error} = await createBillingAdminClient().rpc("cancel_generation_job",{p_job_id:job.id,p_actor_id:user.id});
  if (error) throw new AccessError(409,"CANCEL_UNAVAILABLE","Only work that has not been submitted can be canceled safely.");
  return Response.json({canceled:true});
}); }
