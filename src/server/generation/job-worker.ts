import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APPROVED_BILLING_PLANS } from "@/features/billing/plans";
import { authorizeBillingResource } from "@/server/billing/authorization";
import { createBillingRepository } from "@/server/billing/supabase-repository";
import { jobSchema,scriptProviderReady } from "./job-policy";
import { generateHostedScript } from "./script-provider";
import { billingLaunchReady } from "@/server/access/launch";
import {cloudPreviewReady,startCloudPreview,pollCloudPreview,persistCloudPreview} from "./cloud-preview";

export async function executeGenerationJob(admin:SupabaseClient,id:string,provider=generateHostedScript,
  cloud={start:startCloudPreview,poll:pollCloudPreview,persist:persistCloudPreview}) {
  const claim = await admin.rpc("claim_generation_job",{p_job_id:id});
  if (claim.error) throw new Error("JOB_UNAVAILABLE");
  if (!claim.data) return {state:"unchanged"};
  const job = jobSchema.parse(claim.data), token = job.claim_token;
  if (!token) throw new Error("JOB_UNAVAILABLE");
  let submitted=!!job.provider_handle;
  try {
    if(job.kind === "cloud_render" && job.provider_handle) {
      if(await createBillingRepository(admin).getResourceOwner({kind:"project",id:job.project_id}) !== job.actor_id)throw new Error("OWNERSHIP_REQUIRED");
      if(await cloud.poll(job.provider_handle,job.id)) {
        await cloud.persist(admin,job,job.provider_handle);return {state:"succeeded"};
      }
      const deferred=await admin.rpc("accept_generation_render",{p_job_id:id,p_token:token,p_handle:job.provider_handle});
      if(deferred.error)throw new Error("JOB_UNAVAILABLE");
      return {state:"awaiting_provider"};
    }
    if (job.kind !== "mock_script") {
      if (!billingLaunchReady() || (job.kind === "script"?!scriptProviderReady():!cloudPreviewReady())) throw new Error("FEATURE_UNAVAILABLE");
      const authority=await authorizeBillingResource({enabled:process.env.BILLING_ENABLED === "true",approvedPlans:APPROVED_BILLING_PLANS,maxPending:4,
        repository:createBillingRepository(admin),verifyActor:async()=>({id:job.actor_id,email:null})},{kind:"project",id:job.project_id},job.kind === "cloud_render"?"cloud_render":"generation");
      if(job.kind === "script" && authority.plan.limits.llm_tokens<4096)throw new Error("LIMIT_REACHED");
      if(job.kind === "cloud_render" && (authority.plan.limits.render_seconds<5 || authority.plan.limits.storage_bytes<3145728))throw new Error("LIMIT_REACHED");
    } else if (process.env.MOCK_JOBS_ENABLED !== "true") throw new Error("FEATURE_UNAVAILABLE");
    const start = await admin.rpc("begin_generation_submission",{p_job_id:id,p_token:token});
    if (start.error) throw new Error("JOB_UNAVAILABLE");
    submitted=true;
    if(job.kind === "cloud_render") {
      const handle=await cloud.start(job);
      const accepted=await admin.rpc("accept_generation_render",{p_job_id:id,p_token:token,p_handle:handle});
      if(accepted.error)throw new Error("JOB_UNAVAILABLE");
      return {state:"awaiting_provider"};
    }
    const result = job.kind === "mock_script"
      ? {output:`Mock draft for: ${job.input.topic}\nNo provider was called.`,requestId:null}
      : await provider(job.input);
    const finish = await admin.rpc("finish_generation_job",{p_job_id:id,p_token:token,p_outcome:"succeeded",p_output:result.output,p_request_id:result.requestId});
    if (finish.error) throw new Error("JOB_UNAVAILABLE");
    return {state:"succeeded"};
  } catch {
    // Only before submission can we prove no vendor work. After crossing that
    // boundary, generic errors retain quota and never authorize provider replay.
    const result = await admin.rpc("finish_generation_job",{p_job_id:id,p_token:token,p_outcome:submitted?"unknown":"canceled",p_output:null,p_request_id:null});
    if (result.error) throw new Error("JOB_RECOVERY_REQUIRED");
    return {state:submitted?"unknown":"canceled"};
  }
}
