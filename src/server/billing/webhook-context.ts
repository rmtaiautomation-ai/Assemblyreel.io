import "server-only";
import { APPROVED_BILLING_PLANS } from "@/features/billing/plans";
import { APPROVED_BILLING_OFFERS } from "./catalog";
import { createBillingAdminClient } from "./runtime";
import { configuredStripeMode, createStripeBillingClient } from "./stripe-gateway";
import { createStripeReconciliationGateway } from "./stripe-reconciliation";
import { createWebhookRepository } from "./webhook-repository";
import { verifyBillingWebhook } from "./stripe-webhooks";
import { BillingError, billingDatabaseError } from "./errors";
import type { BillingEventReceipt, BillingWebhookDependencies } from "./webhook-handler";

export interface BillingWebhookContext {
  readonly verify: (body: string, signature: string | null) => Readonly<{ event: BillingEventReceipt; supported: boolean }>;
  readonly dependencies: BillingWebhookDependencies;
  readonly ignore: (event: BillingEventReceipt) => Promise<void>;
}

export function createBillingWebhookContext(): BillingWebhookContext {
  if (process.env.BILLING_WEBHOOKS_ENABLED !== "true") throw new BillingError("BILLING_DISABLED");
  const mode = configuredStripeMode();
  const stripe = createStripeBillingClient(process.env.STRIPE_SECRET_KEY ?? "", mode);
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const admin = createBillingAdminClient();
  const repository = createWebhookRepository(admin);
  const gateway = createStripeReconciliationGateway({ stripe, mode, offers: APPROVED_BILLING_OFFERS, plans: APPROVED_BILLING_PLANS });
  return {
    verify: (body, signature) => verifyBillingWebhook({ stripe, body, signature, secret, mode }),
    dependencies: { repository, ...gateway },
    async ignore(event) {
      await repository.record(event);
      const { error } = await admin.rpc("ignore_billing_webhook", { p_mode: event.mode, p_event_id: event.id });
      if (error) throw billingDatabaseError(error);
    },
  };
}
