import "server-only";
import { z } from "zod";
import { USAGE_METRICS, type BillableFeature, type UsageMetric } from "@/features/billing/types";
import { authorizeBillingResource, type BillingDependencies } from "./authorization";
import { BillingError } from "./errors";
import { fingerprintBillingInput, type BillingJson } from "./fingerprint";
import type { BillingResource } from "./repository";

const reservationSchema = z.object({
  operationKey: z.string().min(8).max(128),
  purpose: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  items: z.partialRecord(z.enum(USAGE_METRICS), z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .refine((items) => Object.keys(items).length > 0),
});

export interface UsageRequest {
  readonly operationKey: string;
  readonly purpose: string;
  readonly items: Readonly<Partial<Record<UsageMetric, number>>>;
  // Caller is a trusted service: hash its VALIDATED provider parameters, not
  // a client-provided hash/quantity or a mutable scene fetched after reserve.
  readonly input: BillingJson;
}

export async function reserveUsage(
  dependencies: BillingDependencies, resource: BillingResource, request: UsageRequest,
  feature: BillableFeature = "generation",
) {
  if (!reservationSchema.safeParse(request).success
    || !Number.isInteger(dependencies.maxPending) || dependencies.maxPending < 1 || dependencies.maxPending > 100) {
    throw new BillingError("INVALID_RESERVATION");
  }
  const fingerprint = fingerprintBillingInput({ resource, purpose: request.purpose, input: request.input });
  const context = await authorizeBillingResource(dependencies, resource, feature);
  for (const metric of USAGE_METRICS) {
    const quantity = request.items[metric];
    if (quantity !== undefined && quantity > context.plan.limits[metric]) throw new BillingError("LIMIT_REACHED");
  }
  const operation = await dependencies.repository.reserve({
    accountId: context.account.id, actorId: context.actor.id, resourceId: resource.id,
    operationKey: request.operationKey, fingerprint, catalogVersion: context.plan.version,
    items: request.items, maxPending: dependencies.maxPending,
  });
  return { ...context, operation } as const;
}
