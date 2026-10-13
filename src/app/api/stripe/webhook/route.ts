import { legacyFeatureResponse } from "@/server/auth/capabilities";
import { billingLaunchReady } from "@/server/access/launch";
import { createBillingWebhookContext } from "@/server/billing/webhook-context";
import { handleBillingWebhook } from "@/server/billing/webhook-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!billingLaunchReady()) return legacyFeatureResponse();
  return handleBillingWebhook(request, createBillingWebhookContext);
}
