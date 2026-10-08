import "server-only";
import { createClient } from "@/lib/supabase/server";
import { APPROVED_BILLING_PLANS } from "@/features/billing/plans";
import { APPROVED_BILLING_OFFERS } from "./catalog";
import { createBillingAdminClient } from "./runtime";
import { createCheckoutRepository } from "./checkout-repository";
import { configuredStripeMode, createStripeBillingClient, createStripeBillingGateway } from "./stripe-gateway";
import type { CheckoutDependencies } from "./checkout-contracts";
import { BillingError } from "./errors";

export async function createCheckoutContext(kind: "checkout" | "portal"): Promise<CheckoutDependencies> {
  const salesEnabled = process.env.BILLING_SALES_ENABLED === "true"
    && APPROVED_BILLING_OFFERS.length > 0 && APPROVED_BILLING_PLANS.length > 0;
  const portalEnabled = process.env.BILLING_PORTAL_ENABLED === "true";
  if (!(kind === "checkout" ? salesEnabled : portalEnabled)) throw new BillingError("BILLING_DISABLED");
  const mode = configuredStripeMode();
  const stripe = createStripeBillingClient(process.env.STRIPE_SECRET_KEY ?? "", mode);
  const auth = await createClient();
  return {
    salesEnabled, portalEnabled, approvedPlans: APPROVED_BILLING_PLANS,
    approvedOffers: APPROVED_BILLING_OFFERS, siteOrigin: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    repository: createCheckoutRepository(createBillingAdminClient()), stripe: createStripeBillingGateway(stripe, mode),
    async verifyActor() {
      try {
        const { data, error } = await auth.auth.getUser();
        if (error || !data.user || data.user.is_anonymous) return null;
        return { id: data.user.id, email: data.user.email ?? null };
      } catch { throw new BillingError("BILLING_UNAVAILABLE"); }
    },
  };
}
