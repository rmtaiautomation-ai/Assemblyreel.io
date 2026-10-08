import "server-only";
import Stripe from "stripe";
import type { StripeMode } from "@/features/billing/types";
import type { StripeBillingGateway } from "./checkout-contracts";
import { BillingError } from "./errors";

// Match the installed stripe@22 SDK schema. Configure the webhook endpoint to
// the same version before wiring; the legacy Stripe singleton is unchanged.
export const BILLING_STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

export function configuredStripeMode(): StripeMode {
  const mode = process.env.BILLING_STRIPE_MODE;
  if (mode !== "test" && mode !== "live") throw new BillingError("PLAN_NOT_CONFIGURED");
  return mode;
}

export function createStripeBillingClient(key: string, mode: StripeMode): Stripe {
  if (!new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]{16,}$`).test(key)
    || /placeholder|dummy/i.test(key)) throw new BillingError("BILLING_UNAVAILABLE");
  return new Stripe(key, { apiVersion: BILLING_STRIPE_API_VERSION, maxNetworkRetries: 0, timeout: 20_000 });
}

export function createStripeBillingGateway(stripe: Stripe, mode: StripeMode): StripeBillingGateway {
  return {
    mode,
    async getPrice(id) {
      const price = await stripe.prices.retrieve(id, { expand: ["product"] });
      return { id: price.id, mode: price.livemode ? "live" : "test", active: price.active,
        productActive: typeof price.product !== "string" && !("deleted" in price.product) && price.product.active,
        amount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? null, usageType: price.recurring?.usage_type ?? null,
        billingScheme: price.billing_scheme };
    },
    async createCustomer(accountId, actor) {
      const customer = await stripe.customers.create({ email: actor.email ?? undefined,
        metadata: { billing_account_id: accountId, owner_id: actor.id } },
      { idempotencyKey: `billing-customer:${mode}:${accountId}` });
      if (customer.livemode !== (mode === "live")) throw new BillingError("PLAN_NOT_CONFIGURED");
      return customer.id;
    },
    async verifyCustomer(customerId, accountId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || customer.livemode !== (mode === "live") || customer.metadata.billing_account_id !== accountId) {
        throw new BillingError("OWNERSHIP_REQUIRED");
      }
    },
    async hasNonTerminalSubscription(customerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      return subscriptions.has_more || subscriptions.data.some((subscription) => !["canceled", "incomplete_expired"].includes(subscription.status));
    },
    async createCheckout(input) {
      const metadata = { billing_account_id: input.accountId, checkout_attempt_id: input.attemptId,
        catalog_version: input.offer.catalogVersion, plan_id: input.offer.planId };
      const session = await stripe.checkout.sessions.create({
        customer: input.customerId, mode: "subscription", payment_method_types: ["card"],
        line_items: [{ price: input.offer.priceId, quantity: 1 }], client_reference_id: input.attemptId,
        success_url: `${input.origin}/billing/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/pricing?checkout=canceled`,
        metadata, subscription_data: { metadata }, allow_promotion_codes: false,
      }, { idempotencyKey: `billing-checkout:${mode}:${input.attemptId}` });
      if (!session.url || session.livemode !== (mode === "live")) throw new BillingError("BILLING_UNAVAILABLE");
      return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000).toISOString() };
    },
    async createPortal(customerId, origin) {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/billing` });
      return session.url;
    },
  };
}
