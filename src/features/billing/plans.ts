import type { BillingPlan, PlanId } from "./types";

// Sales proposals only, not checkout prices or generation entitlements.
export const PLAN_PROPOSALS: readonly {
  readonly id: PlanId;
  readonly name: string;
  readonly proposedMonthlyUsdCents: number;
}[] = Object.freeze([
  Object.freeze({ id: "creator", name: "Creator", proposedMonthlyUsdCents: 4900 }),
  Object.freeze({ id: "pro", name: "Pro", proposedMonthlyUsdCents: 9900 }),
  Object.freeze({ id: "studio", name: "Studio", proposedMonthlyUsdCents: 24900 }),
]);

export const APPROVED_BILLING_PLANS: readonly BillingPlan[] = Object.freeze([]);
export const BILLING_ENABLED_BY_DEFAULT = false;
export const LAUNCH_PREVIEW_MODE = "sample_only" as const;
