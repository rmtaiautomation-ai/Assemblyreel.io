import { z } from "zod";
export const jobIntent = z.object({ projectId:z.string().uuid(), operationId:z.string().uuid(), kind:z.enum(["mock_script","script","cloud_render"]) }).strict();
export const scriptInput = z.object({ topic:z.string().trim().min(1).max(200), version:z.enum(["short-script-v1","account-preview-v1"]) }).strict();
export const renderHandleSchema=z.object({renderId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),bucketName:z.string().min(3).max(63),
  region:z.string().min(1),functionName:z.string().min(1),objectKey:z.string().max(300)}).strict();
export type RenderHandle=z.infer<typeof renderHandleSchema>;
export const jobSchema = z.object({
  id:z.string().uuid(), actor_id:z.string().uuid(), project_id:z.string().uuid(), kind:z.enum(["mock_script","script","cloud_render"]),
  state:z.enum(["queued","claimed","submitting","awaiting_provider","succeeded","canceled","unknown"]), input:scriptInput,
  account_id:z.string().uuid().nullable(), billing_operation_id:z.string().uuid().nullable(),
  claim_token:z.string().uuid().nullable(), output:z.string().nullable(), provider_request_id:z.string().nullable(),
  provider_handle:renderHandleSchema.nullable().optional(),
});
export type GenerationJob = z.infer<typeof jobSchema>;
export const SCRIPT_MODEL = "gpt-4.1-mini-2025-04-14";
export const SCRIPT_OUTPUT_TOKENS = 1024;
export const SCRIPT_RESERVED_TOKENS = 4096;
export function scriptProviderReady() {
  return process.env.COSTLY_FEATURES_ENABLED === "true" && process.env.HOSTED_SCRIPT_ENABLED === "true"
    && process.env.HOSTED_SCRIPT_BOUNDS_ACCEPTED === "true" && /^sk-[A-Za-z0-9_-]{20,}$/.test(process.env.OPENAI_API_KEY ?? "");
}
