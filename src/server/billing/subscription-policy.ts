import type Stripe from "stripe";
import type { BillingInterval, BillingPlan, PlanId, StripeMode, UsageMetric } from "@/features/billing/types";
import { SUBSCRIPTION_STATUSES } from "@/features/billing/types";
import { isApprovedBillingPlan } from "./entitlements";
import { currentAllowanceWindow, type AllowanceWindow } from "./periods";
import { BillingError } from "./errors";
import type { BillingOffer } from "./catalog";

export interface BillingSubscriptionProjection {
  readonly stripeSubscriptionId: string;
  readonly customerId: string;
  readonly priceId: string;
  readonly planId: PlanId | null;
  readonly catalogVersion: string | null;
  readonly status: string;
  readonly billingInterval: BillingInterval;
  readonly cancelAtPeriodEnd: boolean;
  readonly pauseCollection: boolean;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly accessStartsAt: string | null;
  readonly accessExpiresAt: string | null;
  readonly trialEndsAt: string | null;
  readonly verifiedAt: string;
  readonly checkoutAttemptId: string | null;
}

function objectId(value: string | { readonly id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function unixDate(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value * 1000).getTime())) {
    throw new BillingError("BILLING_SYNC_PENDING");
  }
  return new Date(value * 1000).toISOString();
}

// Input must be freshly retrieved Stripe state under the account sync lease,
// NOT event.data.object or checkout's payment_status alone. Conservative MVP:
// one licensed recurring item, no trial, no unpaid renewal or proration grant.
export function projectStripeSubscription(input: {
  readonly subscription: Stripe.Subscription;
  readonly invoice: Stripe.Invoice | null;
  readonly customerId: string;
  readonly mode: StripeMode;
  readonly offers: readonly BillingOffer[];
  readonly plans: readonly BillingPlan[];
  readonly now: number;
}): Readonly<{
  projection: BillingSubscriptionProjection;
  window: AllowanceWindow | null;
  limits: Readonly<Record<UsageMetric, number>> | null;
}> {
  const { subscription, invoice } = input;
  if (!Number.isFinite(input.now) || !Number.isFinite(new Date(input.now).getTime())
    || subscription.livemode !== (input.mode === "live")
    || objectId(subscription.customer) !== input.customerId) throw new BillingError("OWNERSHIP_REQUIRED");
  if (!SUBSCRIPTION_STATUSES.includes(subscription.status)) throw new BillingError("BILLING_SYNC_PENDING");
  if (subscription.items.has_more || subscription.items.data.length !== 1) throw new BillingError("FEATURE_UNAVAILABLE");
  const item = subscription.items.data[0];
  const price = item.price;
  const interval = price.recurring?.interval;
  if ((interval !== "month" && interval !== "year") || price.recurring?.interval_count !== 1
    || price.recurring?.usage_type !== "licensed" || item.quantity !== 1) throw new BillingError("FEATURE_UNAVAILABLE");
  const periodStart = unixDate(item.current_period_start);
  const periodEnd = unixDate(item.current_period_end);
  if (item.current_period_end <= item.current_period_start) throw new BillingError("BILLING_SYNC_PENDING");
  const offers = input.offers.filter((offer) => offer.mode === input.mode && offer.priceId === price.id);
  const offer = offers.length === 1 ? offers[0] : null;
  const plans = offer ? input.plans.filter((candidate) => candidate.id === offer.planId && candidate.version === offer.catalogVersion) : [];
  const plan = plans.length === 1 ? plans[0] : null;
  const mapped = offer?.approved === true && plan && isApprovedBillingPlan(plan)
    && offer.interval === interval && offer.amount === price.unit_amount && offer.currency === price.currency
    && price.livemode === (input.mode === "live") && price.billing_scheme === "per_unit";

  const paid = invoice !== null && objectId(subscription.latest_invoice) === invoice.id
    && invoice.livemode === (input.mode === "live") && objectId(invoice.customer) === input.customerId
    && objectId(invoice.parent?.subscription_details?.subscription ?? null) === subscription.id
    && invoice.status === "paid" && invoice.amount_remaining === 0 && invoice.currency === price.currency
    && !invoice.lines.has_more && invoice.lines.data.some((line) => {
      const parent = line.parent?.subscription_item_details;
      return parent?.subscription === subscription.id && parent.subscription_item === item.id && !parent.proration
        && objectId(line.pricing?.price_details?.price ?? null) === price.id && line.quantity === 1
        && line.period.start <= item.current_period_start && line.period.end >= item.current_period_end;
    });
  const access = Boolean(mapped && paid && subscription.status === "active" && !subscription.pause_collection);
  const projection: BillingSubscriptionProjection = {
    stripeSubscriptionId: subscription.id, customerId: input.customerId, priceId: price.id,
    planId: mapped && offer ? offer.planId : null, catalogVersion: mapped && offer ? offer.catalogVersion : null,
    status: subscription.status, billingInterval: interval, cancelAtPeriodEnd: subscription.cancel_at_period_end,
    pauseCollection: Boolean(subscription.pause_collection), periodStart, periodEnd,
    accessStartsAt: access ? periodStart : null, accessExpiresAt: access ? periodEnd : null,
    trialEndsAt: subscription.trial_end === null ? null : unixDate(subscription.trial_end),
    verifiedAt: new Date(input.now).toISOString(), checkoutAttemptId: subscription.metadata.checkout_attempt_id ?? null,
  };
  const window = access ? currentAllowanceWindow({ interval, periodStart, periodEnd, now: input.now }) : null;
  return { projection, window, limits: window && plan ? plan.limits : null };
}
