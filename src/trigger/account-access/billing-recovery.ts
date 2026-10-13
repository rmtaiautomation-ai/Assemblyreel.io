import { schedules } from "@trigger.dev/sdk/v3";
import { billingLaunchReady } from "@/server/access/launch";
import { createBillingAdminClient } from "@/server/billing/runtime";
import { createBillingWebhookContext } from "@/server/billing/webhook-context";
import { createStripeBillingClient } from "@/server/billing/stripe-gateway";
import { recoverBilling } from "@/server/billing/recovery";
export const billingRecovery=schedules.task({id:"sandbox-billing-recovery-v1",cron:"*/5 * * * *",maxDuration:300,
  run:async()=>{
    if(process.env.BILLING_RECONCILIATION_ENABLED !== "true" || !billingLaunchReady())return {enabled:false};
    const context=createBillingWebhookContext();
    return recoverBilling(createBillingAdminClient(),createStripeBillingClient(process.env.STRIPE_SECRET_KEY ?? "","test"),context.dependencies);
  },
});
