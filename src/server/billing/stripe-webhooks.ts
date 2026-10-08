import "server-only";
import type Stripe from "stripe";
import { BillingError } from "./errors";
import { BILLING_STRIPE_API_VERSION } from "./stripe-gateway";
import type { StripeMode } from "@/features/billing/types";
import type { BillingEventReceipt } from "./webhook-handler";

const subscriptionEvents = new Set([
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid",
  "invoice.payment_failed", "invoice.payment_action_required", "checkout.session.completed",
  "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
]);

export function verifyBillingWebhook(input: {
  readonly stripe: Stripe; readonly body: string; readonly signature: string | null;
  readonly secret: string; readonly mode: StripeMode;
}): Readonly<{ event: BillingEventReceipt; supported: boolean }> {
  if (!input.signature || !/^whsec_[A-Za-z0-9]{16,}$/.test(input.secret)
    || Buffer.byteLength(input.body, "utf8") > 256_000) throw new BillingError("INVALID_REQUEST");
  let event: Stripe.Event;
  try {
    // Verify the ORIGINAL bytes before any JSON parsing/re-serialization.
    event = input.stripe.webhooks.constructEvent(input.body, input.signature, input.secret);
  } catch {
    throw new BillingError("INVALID_REQUEST");
  }
  if (event.livemode !== (input.mode === "live") || event.api_version !== BILLING_STRIPE_API_VERSION) {
    throw new BillingError("PLAN_NOT_CONFIGURED");
  }
  const supported = subscriptionEvents.has(event.type);
  const objectId = "id" in event.data.object && typeof event.data.object.id === "string" ? event.data.object.id : null;
  if ((supported && !objectId) || typeof event.id !== "string" || !event.id || typeof event.type !== "string" || !event.type) {
    throw new BillingError("INVALID_REQUEST");
  }
  return { event: { id: event.id, type: event.type, mode: input.mode, objectId }, supported };
}
