import "server-only";
import { z } from "zod";
import type { BillingInterval, BillingPlan, PlanId, StripeMode } from "@/features/billing/types";
import { isApprovedBillingPlan } from "./entitlements";
import { BillingError } from "./errors";

export interface BillingOffer {
  readonly planId: PlanId;
  readonly catalogVersion: string;
  readonly interval: BillingInterval;
  readonly mode: StripeMode;
  readonly priceId: string;
  readonly amount: number;
  readonly currency: string;
  readonly approved: boolean;
}

// No final allowances/prices were approved. Env price IDs alone grant nothing.
export const APPROVED_BILLING_OFFERS: readonly BillingOffer[] = Object.freeze([]);

export const checkoutIntentSchema = z.object({
  planId: z.enum(["creator", "pro", "studio"]), interval: z.enum(["month", "year"]),
  operationKey: z.string().min(8).max(128),
}).strict();

export function resolveBillingOffer(input: {
  readonly planId: PlanId; readonly interval: BillingInterval; readonly mode: StripeMode;
  readonly offers: readonly BillingOffer[]; readonly plans: readonly BillingPlan[];
}): BillingOffer {
  const candidates = input.offers.filter((offer) => offer.planId === input.planId
    && offer.interval === input.interval && offer.mode === input.mode);
  if (candidates.length !== 1) throw new BillingError("PLAN_NOT_CONFIGURED");
  const offer = candidates[0];
  const plans = input.plans.filter((value) => value.id === offer.planId && value.version === offer.catalogVersion);
  const plan = plans.length === 1 ? plans[0] : null;
  if (!offer.approved || !plan || !isApprovedBillingPlan(plan) || !/^price_[A-Za-z0-9]+$/.test(offer.priceId)
    || !Number.isSafeInteger(offer.amount) || offer.amount <= 0 || !/^[a-z]{3}$/.test(offer.currency)
    || input.offers.filter((value) => value.mode === offer.mode && value.priceId === offer.priceId).length !== 1) {
    throw new BillingError("PLAN_NOT_CONFIGURED");
  }
  return offer;
}

export function billingSiteOrigin(value: string): string {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new BillingError("PLAN_NOT_CONFIGURED");
  }
}
