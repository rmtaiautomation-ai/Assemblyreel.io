import { legacyFeatureResponse } from "@/server/auth/capabilities";
import { billingLaunchReady } from "@/server/access/launch";
import { createCheckoutContext } from "@/server/billing/checkout-context";
import { handlePortalRequest } from "@/server/billing/request-handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!billingLaunchReady()) return legacyFeatureResponse();
  return handlePortalRequest(request, () => createCheckoutContext("portal"));
}
