import type {
  AccessDecision, BillableFeature, BillingPlan, SubscriptionSnapshot,
} from "@/features/billing/types";
import { USAGE_METRICS } from "@/features/billing/types";
import { billingTimestampMillis } from "./timestamps";

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isApprovedBillingPlan(plan: BillingPlan): boolean {
  return plan.approved === true && typeof plan.version === "string" && plan.version.trim().length > 0
    && ["creator", "pro", "studio"].includes(plan.id)
    && validLimit(plan.workspaceLimit)
    && typeof plan.limits === "object" && plan.limits !== null && Array.isArray(plan.features)
    && USAGE_METRICS.every((metric) => validLimit(plan.limits[metric]));
}

export interface AccessInput {
  readonly actorId: string | null;
  readonly subscription: SubscriptionSnapshot | null;
  readonly billingEnabled?: boolean;
  readonly approvedPlans?: readonly BillingPlan[];
  readonly feature?: BillableFeature;
  readonly now?: number;
}

// Pure policy for a future authenticated server adapter. It does not verify a
// session or fetch Stripe state. Omitted activation/catalog inputs fail closed.
export function evaluateBillingAccess({
  actorId, subscription, billingEnabled = false, approvedPlans = [],
  feature = "generation", now = Date.now(),
}: AccessInput): AccessDecision {
  if (billingEnabled !== true) return { allowed: false, code: "BILLING_DISABLED" };
  if (!actorId) return { allowed: false, code: "AUTH_REQUIRED" };
  if (!subscription) return { allowed: false, code: "SUBSCRIPTION_REQUIRED" };
  if (subscription.ownerId !== actorId) return { allowed: false, code: "OWNERSHIP_REQUIRED" };
  if (subscription.accountEnabled !== true) return { allowed: false, code: "BILLING_DISABLED" };
  if (subscription.isCurrent !== true || subscription.status !== "active" || subscription.pauseCollection !== false) {
    return { allowed: false, code: "SUBSCRIPTION_REQUIRED" };
  }

  const verifiedAt = billingTimestampMillis(subscription.verifiedAt);
  const startsAt = billingTimestampMillis(subscription.accessStartsAt);
  const expiresAt = billingTimestampMillis(subscription.accessExpiresAt);
  if (![now, verifiedAt, startsAt, expiresAt].every(Number.isFinite)
    || verifiedAt > now || startsAt >= expiresAt || now < startsAt || now >= expiresAt) {
    return { allowed: false, code: "BILLING_SYNC_PENDING" };
  }

  const candidates = approvedPlans.filter((candidate) => candidate.id === subscription.planId
    && candidate.version === subscription.catalogVersion);
  const plan = candidates.length === 1 ? candidates[0] : null;
  if (!plan || !isApprovedBillingPlan(plan)) return { allowed: false, code: "PLAN_NOT_CONFIGURED" };
  if (!plan.features.includes(feature)) return { allowed: false, code: "FEATURE_UNAVAILABLE" };
  return { allowed: true, accountId: subscription.accountId, plan };
}
