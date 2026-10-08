import { createBillingWebhookContext } from "@/server/billing/webhook-context";
import { handleBillingWebhook } from "@/server/billing/webhook-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBillingWebhook(request, createBillingWebhookContext);
}
