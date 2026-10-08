import "server-only";
import type { BillableFeature } from "@/features/billing/types";
import type { BillingDependencies } from "@/server/billing/authorization";
import type { BillingResource, ReservedOperation } from "@/server/billing/repository";
import { reserveUsage, type UsageRequest } from "@/server/billing/usage";

export type ProviderResult<T> =
  | { readonly outcome: "provider_completed"; readonly value: T; readonly provider: string; readonly requestId?: string }
  | { readonly outcome: "provider_accepted"; readonly value: T; readonly provider: string; readonly requestId: string }
  | { readonly outcome: "no_work_confirmed"; readonly provider: string; readonly errorCode: string }
  | { readonly outcome: "submission_uncertain"; readonly provider: string; readonly errorCode: string; readonly requestId?: string };

export type MeteredResult<T> =
  | { readonly kind: "replay"; readonly operation: ReservedOperation }
  | { readonly kind: "result"; readonly operationId: string; readonly result: ProviderResult<T> };

// Shared request/worker boundary. Intentionally NOT wired to existing providers
// yet: each adapter must derive costs/bounds and implement evidence correctly.
export async function runMeteredGeneration<T>(options: {
  readonly dependencies: BillingDependencies;
  readonly resource: BillingResource;
  readonly usage: UsageRequest;
  readonly feature?: BillableFeature;
  readonly start: (operationId: string) => Promise<ProviderResult<T>>;
}): Promise<MeteredResult<T>> {
  const context = await reserveUsage(options.dependencies, options.resource, options.usage, options.feature);
  if (!context.operation.created) return { kind: "replay", operation: context.operation };
  const settlement = { accountId: context.account.id, operationId: context.operation.id };
  // Persist uncertainty BEFORE crossing the vendor boundary. If we crash or
  // lose its response, retries cannot invoke start again. Recovery must obtain
  // provider evidence; this is not universal exactly-once vendor execution.
  await options.dependencies.repository.settle({ ...settlement, outcome: "submission_uncertain" });
  const result = await options.start(context.operation.id);
  // Any thrown provider error retains the reservation. Never infer no-work
  // from generic exceptions, timeouts, output-storage failure, or polling errors.
  await options.dependencies.repository.settle({
    ...settlement, outcome: result.outcome, provider: result.provider,
    providerRequestId: "requestId" in result ? result.requestId : undefined,
    errorCode: "errorCode" in result ? result.errorCode : undefined,
  });
  return { kind: "result", operationId: context.operation.id, result };
}
