import "server-only";
import type Stripe from "stripe";
import type { BillingPlan, StripeMode } from "@/features/billing/types";
import type { BillingAccount } from "./repository";
import type { BillingOffer } from "./catalog";
import type { BillingEventReceipt } from "./webhook-handler";
import { projectStripeSubscription } from "./subscription-policy";
import { BillingError } from "./errors";

function objectId(value: string | { readonly id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function createStripeReconciliationGateway(input: {
  readonly stripe: Stripe; readonly mode: StripeMode;
  readonly offers: readonly BillingOffer[]; readonly plans: readonly BillingPlan[];
}) {
  function assertMode(livemode: boolean): void {
    if (livemode !== (input.mode === "live")) throw new BillingError("PLAN_NOT_CONFIGURED");
  }

  return {
    async resolve(event: BillingEventReceipt) {
      if (event.mode !== input.mode) throw new BillingError("PLAN_NOT_CONFIGURED");
      let customerId: string | null = null;
      let subscriptionId: string | null = null;
      if (event.type.startsWith("customer.subscription.") && event.objectId?.startsWith("sub_")) {
        const subscription = await input.stripe.subscriptions.retrieve(event.objectId);
        assertMode(subscription.livemode);
        customerId = objectId(subscription.customer);
        subscriptionId = subscription.id;
      } else if (event.type.startsWith("invoice.") && event.objectId?.startsWith("in_")) {
        const invoice = await input.stripe.invoices.retrieve(event.objectId);
        assertMode(invoice.livemode);
        customerId = objectId(invoice.customer);
        subscriptionId = objectId(invoice.parent?.subscription_details?.subscription ?? null);
      } else if (event.type.startsWith("checkout.session.") && event.objectId?.startsWith("cs_")) {
        const session = await input.stripe.checkout.sessions.retrieve(event.objectId);
        assertMode(session.livemode);
        customerId = objectId(session.customer);
        subscriptionId = objectId(session.subscription);
      }
      if (!customerId || !subscriptionId) throw new BillingError("BILLING_SYNC_PENDING");
      return { customerId, subscriptionId };
    },
    async retrieveState(subscriptionId: string, account: BillingAccount) {
      if (account.stripeMode !== input.mode || !account.stripeCustomerId) throw new BillingError("OWNERSHIP_REQUIRED");
      const subscription = await input.stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
      assertMode(subscription.livemode);
      if (subscription.metadata.billing_account_id && subscription.metadata.billing_account_id !== account.id) {
        throw new BillingError("OWNERSHIP_REQUIRED");
      }
      let invoice: Stripe.Invoice | null = typeof subscription.latest_invoice === "string"
        ? await input.stripe.invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
      if (invoice?.lines.has_more) {
        // Bounded fetch. If still truncated, policy grants no access, rather than
        // interpreting an arbitrary partial page as full paid-cycle evidence.
        const lines = await input.stripe.invoices.listLineItems(invoice.id, { limit: 100 });
        invoice = { ...invoice, lines };
      }
      return projectStripeSubscription({ subscription, invoice, mode: input.mode, customerId: account.stripeCustomerId,
        offers: input.offers, plans: input.plans, now: Date.now() });
    },
  };
}
