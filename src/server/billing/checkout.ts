import "server-only";
import { z } from "zod";
import { billingSiteOrigin, checkoutIntentSchema, resolveBillingOffer, type BillingOffer } from "./catalog";
import type { CheckoutDependencies, StripePriceSnapshot } from "./checkout-contracts";
import { BillingError } from "./errors";
import { fingerprintBillingInput } from "./fingerprint";
import { billingTimestampMillis } from "./timestamps";

export function assertCheckoutPrice(offer: BillingOffer, price: StripePriceSnapshot): void {
  if (price.id !== offer.priceId || price.mode !== offer.mode || price.active !== true || price.productActive !== true
    || price.amount !== offer.amount || price.currency !== offer.currency || price.interval !== offer.interval
    || price.intervalCount !== 1 || price.usageType !== "licensed" || price.billingScheme !== "per_unit") {
    throw new BillingError("PLAN_NOT_CONFIGURED");
  }
}

export function assertStripeRedirect(value: string, kind: "checkout" | "portal"): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password
      || url.hostname !== (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com")) throw new Error();
    return value;
  } catch {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}

async function verifiedAccount(dependencies: CheckoutDependencies) {
  const actor = await dependencies.verifyActor();
  if (!actor || !z.uuid().safeParse(actor.id).success) throw new BillingError("AUTH_REQUIRED");
  const account = await dependencies.repository.getAccountForActor(actor.id);
  if (!account) throw new BillingError("BILLING_SYNC_PENDING");
  if (account.ownerId !== actor.id) throw new BillingError("OWNERSHIP_REQUIRED");
  if (account.stripeMode !== dependencies.stripe.mode) throw new BillingError("PLAN_NOT_CONFIGURED");
  return { actor, account };
}

export async function startBillingCheckout(dependencies: CheckoutDependencies, body: unknown): Promise<{ url: string }> {
  if (dependencies.salesEnabled !== true) throw new BillingError("BILLING_DISABLED");
  const intent = checkoutIntentSchema.safeParse(body);
  if (!intent.success) throw new BillingError("INVALID_REQUEST");
  const origin = billingSiteOrigin(dependencies.siteOrigin);
  const { actor, account } = await verifiedAccount(dependencies);
  if (!account.enabled) throw new BillingError("BILLING_DISABLED");
  const offer = resolveBillingOffer({ ...intent.data, mode: dependencies.stripe.mode,
    offers: dependencies.approvedOffers, plans: dependencies.approvedPlans });
  let attemptId: string | null = null;
  try {
    assertCheckoutPrice(offer, await dependencies.stripe.getPrice(offer.priceId));
    const attempt = await dependencies.repository.begin({ accountId: account.id, actorId: actor.id,
      operationKey: intent.data.operationKey, fingerprint: fingerprintBillingInput({ offer: { ...offer }, origin }), offer });
    if (!attempt.created) {
      if (attempt.state !== "ready" || !attempt.url || !attempt.expiresAt
        || billingTimestampMillis(attempt.expiresAt) <= (dependencies.now?.() ?? Date.now())
        || !Number.isFinite(billingTimestampMillis(attempt.expiresAt))) throw new BillingError("BILLING_SYNC_PENDING");
      return { url: assertStripeRedirect(attempt.url, "checkout") };
    }
    attemptId = attempt.id;
    const customerId = account.stripeCustomerId ?? await dependencies.stripe.createCustomer(account.id, actor);
    await dependencies.stripe.verifyCustomer(customerId, account.id);
    if (!account.stripeCustomerId) await dependencies.repository.bindCustomer(account.id, actor.id, customerId);
    if (await dependencies.stripe.hasNonTerminalSubscription(customerId)) throw new BillingError("OPERATION_CONFLICT");
    const session = await dependencies.stripe.createCheckout({ accountId: account.id, attemptId,
      customerId, offer, origin });
    assertStripeRedirect(session.url, "checkout");
    const expiresAt = billingTimestampMillis(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= (dependencies.now?.() ?? Date.now())) throw new BillingError("BILLING_UNAVAILABLE");
    await dependencies.repository.ready(account.id, attemptId, session);
    return { url: session.url };
  } catch (error) {
    // Even a lost response or failed customer/session binding keeps the attempt
    // blocked. Recovery must inspect Stripe, not generate a second session/key.
    if (attemptId) {
      try { await dependencies.repository.markUnknown(account.id, attemptId); }
      catch { throw new BillingError("BILLING_UNAVAILABLE"); }
    }
    if (error instanceof BillingError) throw error;
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}

export async function startBillingPortal(dependencies: CheckoutDependencies): Promise<{ url: string }> {
  // Existing customers must retain billing-management access when new sales or
  // generation are disabled. Portal has its own deployment gate, not paid status.
  if (dependencies.portalEnabled !== true) throw new BillingError("BILLING_DISABLED");
  const origin = billingSiteOrigin(dependencies.siteOrigin);
  const { account } = await verifiedAccount(dependencies);
  if (!account.stripeCustomerId) throw new BillingError("SUBSCRIPTION_REQUIRED");
  try {
    await dependencies.stripe.verifyCustomer(account.stripeCustomerId, account.id);
    return { url: assertStripeRedirect(await dependencies.stripe.createPortal(account.stripeCustomerId, origin), "portal") };
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}
