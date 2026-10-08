import "server-only";
import type { CheckoutDependencies } from "./checkout-contracts";
import { startBillingCheckout, startBillingPortal } from "./checkout";
import { billingErrorResponse, billingJsonResponse, readCheckoutJson, requireBillingOrigin } from "./http";

export async function handleCheckoutRequest(request: Request, context: () => Promise<CheckoutDependencies>): Promise<Response> {
  try {
    const dependencies = await context();
    requireBillingOrigin(request, dependencies.siteOrigin);
    return billingJsonResponse(await startBillingCheckout(dependencies, await readCheckoutJson(request)));
  } catch (error) { return billingErrorResponse(error); }
}

export async function handlePortalRequest(request: Request, context: () => Promise<CheckoutDependencies>): Promise<Response> {
  try {
    const dependencies = await context();
    requireBillingOrigin(request, dependencies.siteOrigin);
    return billingJsonResponse(await startBillingPortal(dependencies));
  } catch (error) { return billingErrorResponse(error); }
}
