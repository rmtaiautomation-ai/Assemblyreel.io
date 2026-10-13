import "server-only";
import { accessContext, requireOwnedProject } from "@/server/access/ownership";
import { requireJobs,requireBillingLaunch } from "@/server/access/launch";
import { AccessError } from "@/server/access/requests";
import { createBillingAdminClient, createRequestDependencies } from "@/server/billing/runtime";
import { authorizeBillingResource } from "@/server/billing/authorization";
import { fingerprintBillingInput } from "@/server/billing/fingerprint";
import { jobIntent, scriptInput, scriptProviderReady } from "./job-policy";
import { BillingError } from "@/server/billing/errors";
import { cloudPreviewReady } from "./cloud-preview";

export async function enqueueJob(value:unknown) {
  requireJobs();
  const input = jobIntent.parse(value);
  if (input.kind === "mock_script" && process.env.MOCK_JOBS_ENABLED !== "true") throw new AccessError(503,"FEATURE_UNAVAILABLE","Mock jobs are unavailable.");
  if (input.kind === "script" && !scriptProviderReady()) throw new AccessError(503,"FEATURE_UNAVAILABLE","Hosted scripts are unavailable.");
  if (input.kind === "cloud_render" && !cloudPreviewReady()) throw new AccessError(503,"FEATURE_UNAVAILABLE","Cloud previews are unavailable.");
  const { client,user } = await accessContext();
  const project = await requireOwnedProject(client,user.id,input.projectId);
  const snapshot = scriptInput.parse({topic:project.topic,version:input.kind === "cloud_render"?"account-preview-v1":"short-script-v1"});
  let accountId:string|null = null, catalogVersion:string|null = null;
  if (input.kind !== "mock_script") {
    requireBillingLaunch();
    const authority = await authorizeBillingResource(createRequestDependencies(client),{kind:"project",id:project.id},input.kind === "cloud_render"?"cloud_render":"generation");
    accountId = authority.account.id; catalogVersion = authority.plan.version;
  }
  const admin = createBillingAdminClient();
  const {data,error} = await admin.rpc("enqueue_generation_job",{
    p_actor_id:user.id,p_project_id:project.id,p_operation_key:input.operationId,p_kind:input.kind,p_input:snapshot,
    p_fingerprint:fingerprintBillingInput({resource:{kind:"project",id:project.id},purpose:input.kind,input:snapshot}),
    p_account_id:accountId,p_catalog_version:catalogVersion,
  });
  if (error) throw new BillingError(["LIMIT_REACHED","CONCURRENCY_LIMIT"].includes(error.message) ? "LIMIT_REACHED" : error.message === "OPERATION_CONFLICT" ? "OPERATION_CONFLICT" : "BILLING_UNAVAILABLE");
  // The database is the queue. Dispatch failure never loses or creates another job.
  return {id:data as string};
}
