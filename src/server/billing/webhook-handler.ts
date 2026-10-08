import "server-only";
import type { StripeMode } from "@/features/billing/types";
import type { BillingAccount } from "./repository";
import type { BillingSubscriptionProjection } from "./subscription-policy";
import type { projectStripeSubscription } from "./subscription-policy";
import { BillingError } from "./errors";

export interface BillingEventReceipt {
  readonly id: string;
  readonly mode: StripeMode;
  readonly type: string;
  readonly objectId: string | null;
}

export interface WebhookRepository {
  record(event: BillingEventReceipt): Promise<void>;
  findAccount(mode: StripeMode, customerId: string): Promise<BillingAccount | null>;
  claim(accountId: string, event: BillingEventReceipt): Promise<
    | { readonly claimed: true; readonly token: string }
    | { readonly claimed: false; readonly status: "busy" | "processed" | "ignored" }
  >;
  apply(accountId: string, event: BillingEventReceipt, token: string,
    state: ReturnType<typeof projectStripeSubscription>): Promise<void>;
  fail(accountId: string, event: BillingEventReceipt, token: string, code: string): Promise<void>;
}

export interface BillingWebhookDependencies {
  readonly repository: WebhookRepository;
  // Resolve customer/subscription by retrieving the identifier from Stripe.
  // The event body supplies hints only; it is never entitlement authority.
  readonly resolve: (event: BillingEventReceipt) => Promise<Readonly<{ customerId: string; subscriptionId: string }>>;
  // Must retrieve fresh state AFTER obtaining the account lease. This makes
  // reversed deliveries converge and prevents stale request snapshots winning.
  readonly retrieveState: (subscriptionId: string, account: BillingAccount) => Promise<ReturnType<typeof projectStripeSubscription>>;
}

export async function reconcileBillingEvent(dependencies: BillingWebhookDependencies, event: BillingEventReceipt): Promise<"processed" | "duplicate"> {
  await dependencies.repository.record(event);
  const target = await dependencies.resolve(event);
  const account = await dependencies.repository.findAccount(event.mode, target.customerId);
  if (!account || account.stripeMode !== event.mode || account.stripeCustomerId !== target.customerId) {
    throw new BillingError("BILLING_SYNC_PENDING");
  }
  const claim = await dependencies.repository.claim(account.id, event);
  if (!claim.claimed) {
    if (claim.status === "busy") throw new BillingError("BILLING_SYNC_PENDING");
    return "duplicate";
  }
  try {
    const state = await dependencies.retrieveState(target.subscriptionId, account);
    assertProjectionTarget(state.projection, account, target.subscriptionId);
    // One fenced database RPC commits projection + allowance + processed event.
    await dependencies.repository.apply(account.id, event, claim.token, state);
    return "processed";
  } catch (error) {
    const code = error instanceof BillingError ? error.code : "BILLING_UNAVAILABLE";
    try { await dependencies.repository.fail(account.id, event, claim.token, code); }
    catch { throw new BillingError("BILLING_UNAVAILABLE"); }
    throw new BillingError(code);
  }
}

function assertProjectionTarget(projection: BillingSubscriptionProjection, account: BillingAccount, subscriptionId: string): void {
  if (projection.customerId !== account.stripeCustomerId || projection.stripeSubscriptionId !== subscriptionId) {
    throw new BillingError("OWNERSHIP_REQUIRED");
  }
}
