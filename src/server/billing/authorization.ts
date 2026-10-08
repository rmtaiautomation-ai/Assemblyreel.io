import "server-only";
import { z } from "zod";
import type { BillableFeature, BillingPlan } from "@/features/billing/types";
import { evaluateBillingAccess } from "./entitlements";
import { BillingError } from "./errors";
import type { BillingActor, BillingRepository, BillingResource } from "./repository";

export interface BillingDependencies {
  readonly verifyActor: () => Promise<BillingActor | null>;
  readonly repository: BillingRepository;
  readonly enabled: boolean;
  readonly approvedPlans: readonly BillingPlan[];
  readonly maxPending: number;
  readonly now?: () => number;
}

const resourceSchema = z.object({ kind: z.enum(["workspace", "project", "scene", "media"]), id: z.uuid() }).strict();

// Request adapters supply verifyActor from Supabase getUser(), never a cookie
// flag, getSession(), request body, or client-supplied account/user ID.
export async function authorizeBillingResource(
  dependencies: BillingDependencies, resource: BillingResource, feature: BillableFeature = "generation",
) {
  if (dependencies.enabled !== true) throw new BillingError("BILLING_DISABLED");
  if (!resourceSchema.safeParse(resource).success) throw new BillingError("INVALID_REQUEST");
  const actor = await dependencies.verifyActor();
  if (!actor || !z.uuid().safeParse(actor.id).success) throw new BillingError("AUTH_REQUIRED");
  const [account, ownerId] = await Promise.all([
    dependencies.repository.getAccountForActor(actor.id), dependencies.repository.getResourceOwner(resource),
  ]);
  if (ownerId !== actor.id) throw new BillingError("OWNERSHIP_REQUIRED");
  if (!account) throw new BillingError("SUBSCRIPTION_REQUIRED");
  if (account.ownerId !== actor.id) throw new BillingError("OWNERSHIP_REQUIRED");
  const subscription = await dependencies.repository.getCurrentSubscription(account);
  if (subscription && subscription.accountId !== account.id) throw new BillingError("BILLING_UNAVAILABLE");
  const decision = evaluateBillingAccess({ actorId: actor.id, subscription, billingEnabled: dependencies.enabled,
    approvedPlans: dependencies.approvedPlans, feature, now: dependencies.now?.() ?? Date.now() });
  if (!decision.allowed) throw new BillingError(decision.code);
  return { actor, account, plan: decision.plan, resource } as const;
}
