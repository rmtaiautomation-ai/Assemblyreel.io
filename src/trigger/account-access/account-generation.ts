import { task,schedules,tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createBillingAdminClient } from "@/server/billing/runtime";
import { requireJobs } from "@/server/access/launch";
import { executeGenerationJob } from "@/server/generation/job-worker";

export const accountGeneration = task({id:"account-generation-v1",maxDuration:90,retry:{maxAttempts:1},
  run:async(payload:{jobId:string})=>{
    requireJobs();
    return executeGenerationJob(createBillingAdminClient(),z.string().uuid().parse(payload.jobId));
  },
});
export const dispatchAccountJobs = schedules.task({id:"dispatch-account-jobs-v1",cron:"* * * * *",maxDuration:60,
  run:async()=>{
    if(process.env.JOB_DISPATCH_ENABLED !== "true")return {dispatched:0};
    requireJobs(); const admin=createBillingAdminClient();
    const now=new Date().toISOString();
    const {data,error}=await admin.from("generation_jobs").select("id,state,lease_until").or(`state.eq.queued,and(state.in.(claimed,submitting,awaiting_provider),lease_until.lt.${now}),and(state.eq.unknown,provider_handle.not.is.null,lease_until.lt.${now})`).order("updated_at").limit(20);
    if(error)throw new Error("JOB_DISPATCH_UNAVAILABLE");
    for(const job of data ?? []) await tasks.trigger("account-generation-v1",{jobId:job.id},
      {idempotencyKey:`dispatch:${job.id}:${Math.floor(Date.now()/60_000)}`,idempotencyKeyTTL:"2m"});
    return {dispatched:data?.length ?? 0};
  },
});
