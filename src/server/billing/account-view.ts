import "server-only";
import { z } from "zod";
import { accessContext } from "@/server/access/ownership";
import { requireBillingLaunch } from "@/server/access/launch";
import { APPROVED_BILLING_PLANS } from "@/features/billing/plans";
import { USAGE_METRICS } from "@/features/billing/types";
import { APPROVED_BILLING_OFFERS } from "./catalog";
import { createBillingAdminClient } from "./runtime";
import { createBillingRepository } from "./supabase-repository";
import { evaluateBillingAccess } from "./entitlements";
import { remainingUsage } from "./usage-policy";
import { BillingError } from "./errors";

const periodSchema = z.object({ metric: z.enum(USAGE_METRICS), window_start: z.string(), window_end: z.string(),
  limit_quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), used_quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  reserved_quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
export async function readBillingAccount() {
  requireBillingLaunch();
  const { user } = await accessContext();
  const admin = createBillingAdminClient();
  const repository = createBillingRepository(admin);
  const account = await repository.getAccountForActor(user.id);
  if (account && (account.ownerId !== user.id || account.stripeMode !== "test")) throw new BillingError("OWNERSHIP_REQUIRED");
  const subscription = account ? await repository.getCurrentSubscription(account) : null;
  const decision = evaluateBillingAccess({ actorId:user.id, subscription, billingEnabled:process.env.BILLING_ENABLED === "true", approvedPlans:APPROVED_BILLING_PLANS });
  const usage: {metric:string;limit:number;used:number;reserved:number;remaining:number|null;windowEnd:string}[] = [];
  let recoveryNeeded = 0;
  let pendingCheckout: string | null = null;
  let billingDate: string | null = null;
  let interval: string | null = null;
  if (account) {
    const now = new Date().toISOString();
    const [periods,attempts,dates,recovery] = await Promise.all([
      admin.from("billing_usage_periods").select("metric,window_start,window_end,limit_quantity,used_quantity,reserved_quantity").eq("account_id",account.id).lte("window_start",now).gt("window_end",now),
      admin.from("billing_checkout_attempts").select("state").eq("account_id",account.id).order("created_at",{ascending:false}).limit(1),
      admin.from("billing_subscriptions").select("current_period_end,billing_interval").eq("account_id",account.id).eq("is_current",true).maybeSingle(),
      admin.from("billing_operations").select("id",{count:"exact",head:true}).eq("account_id",account.id).in("state",["unknown","submitted"]),
    ]);
    if (periods.error || attempts.error || dates.error || recovery.error) throw new BillingError("BILLING_UNAVAILABLE");
    recoveryNeeded=recovery.count ?? 0;
    for (const value of periods.data ?? []) {
      const row = periodSchema.parse(value);
      if(usage.some(item=>item.metric === row.metric))throw new BillingError("BILLING_SYNC_PENDING");
      usage.push({ metric:row.metric, limit:row.limit_quantity, used:row.used_quantity, reserved:row.reserved_quantity,
        remaining:remainingUsage({limit:row.limit_quantity,used:row.used_quantity,reserved:row.reserved_quantity}), windowEnd:row.window_end });
    }
    pendingCheckout = attempts.data?.[0]?.state ?? null;
    billingDate = dates.data?.current_period_end ?? null; interval = dates.data?.billing_interval ?? null;
  }
  return { enrolled:!!account, mode:"test", access:decision.allowed ? "active" : decision.code,
    subscription: subscription ? { status:subscription.status, plan:subscription.planId, cancelAtPeriodEnd:subscription.cancelAtPeriodEnd, accessExpiresAt:subscription.accessExpiresAt } : null,
    usage, billingDate, interval, pendingCheckout, recoveryNeeded,
    portalAvailable:!!account?.stripeCustomerId && process.env.BILLING_PORTAL_ENABLED === "true",
    offers:process.env.BILLING_SALES_ENABLED === "true" ? APPROVED_BILLING_OFFERS.filter(offer => offer.mode === "test" && offer.approved).map(offer => ({planId:offer.planId,interval:offer.interval,amount:offer.amount,currency:offer.currency})) : [],
  };
}
