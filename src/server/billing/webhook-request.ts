import "server-only";
import type { BillingWebhookContext } from "./webhook-context";
import { reconcileBillingEvent } from "./webhook-handler";
import { billingErrorResponse, billingJsonResponse, readBillingBody } from "./http";

export async function handleBillingWebhook(request: Request, context: () => BillingWebhookContext): Promise<Response> {
  try {
    const dependencies = context();
    const verified = dependencies.verify(await readBillingBody(request, 256_000), request.headers.get("stripe-signature"));
    if (!verified.supported) {
      await dependencies.ignore(verified.event);
      return billingJsonResponse({ received: true, status: "ignored" });
    }
    const status = await reconcileBillingEvent(dependencies.dependencies, verified.event);
    return billingJsonResponse({ received: true, status });
  } catch (error) { return billingErrorResponse(error); }
}
